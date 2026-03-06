import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { analyzeImage, checkModelAvailability } from '@/services/cvService';
import { preprocessImage, detectDefects } from '@/lib/gemini';
import { detectHighEdgeDensity } from '@/lib/imageHeuristics';
import { useCreateInspectionResults } from './useAI';
import { apiFetch } from '@/lib/api';

export interface Mission {
  id: string;
  panel_id: string;
  panel_label: string;
  site_name: string;
  status: string;
  approved_by_user_id: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  created_at: string;
  created_by_user_id?: string | null;
}

interface MissionRow {
  id: string;
  panel_id: string;
  status: string;
  approved_by_user_id: string | null;
  approved_at: string | null;
  created_at: string;
  panels: {
    label: string | null;
    sites: { name: string | null } | null;
  } | null;
}

const normalizeMissionStatus = (status: string): string => {
  // Map legacy statuses to simplified flow
  if (['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_FLIGHT'].includes(status)) return 'OPEN';
  if (status === 'CANCELLED') return 'COMPLETED';
  return status;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';
const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface MissionImage {
  id: string;
  mission_id: string;
  storage_path: string;
  content_type: string;
  uploaded_by_user_id: string;
  uploaded_at: string;
  url?: string;
}

export function useMissions() {
  return useQuery({
    queryKey: ['missions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('missions')
        .select(`
          id,
          panel_id,
          status,
          approved_by_user_id,
          approved_at,
          created_at,
          panels (
            label,
            sites (name)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as unknown as MissionRow[]).map((row) => ({
        id: row.id,
        panel_id: row.panel_id,
        status: normalizeMissionStatus(row.status),
        approved_by_user_id: row.approved_by_user_id,
        approved_by_name: null,
        approved_at: row.approved_at,
        created_at: row.created_at,
        panel_label: row.panels?.label || 'Unknown Panel',
        site_name: row.panels?.sites?.name || 'Unknown Site',
        created_by_user_id: null,
      })) as Mission[];
    },
  });
}

export function useMissionImages(missionId: string | null) {
  return useQuery({
    queryKey: ['mission-images', missionId],
    queryFn: async () => {
      if (!missionId) return [];

      const { data, error } = await supabase
        .from('mission_images')
        .select('*')
        .eq('mission_id', missionId);

      if (error) throw error;

      // Get public URLs for each image
      const imagesWithUrls = await Promise.all(
        (data as MissionImage[]).map(async (img) => {
          const { data: urlData } = supabase.storage
            .from('mission_images')
            .getPublicUrl(img.storage_path);
          return { ...img, url: urlData.publicUrl };
        })
      );

      return imagesWithUrls;
    },
    enabled: !!missionId,
  });
}

export function useApproveMission() {
  // Kept for backward compatibility but now unused
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (missionId: string) => {
      // No-op in simplified flow
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
    },
  });
}

export function useUpdateMissionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ missionId, status }: { missionId: string; status: string }) => {
      const { error } = await supabase
        .from('missions')
        .update({ status })
        .eq('id', missionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      toast.success('Mission status updated!');
    },
    onError: (error) => {
      console.error('Error updating mission:', error);
      toast.error('Failed to update mission status');
    },
  });
}

export function useUploadMissionImage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const createInspection = useCreateInspectionResults();

  // Helper to get image dimensions
  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        reject(new Error('Failed to load image'));
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  return useMutation({
    mutationFn: async ({ 
      missionId, 
      file, 
      enableAI = true 
    }: { 
      missionId: string; 
      file: File; 
      enableAI?: boolean;
    }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        throw new Error('Unsupported image type. Allowed: JPG, PNG, WEBP.');
      }
      if (file.size > MAX_IMAGE_FILE_BYTES) {
        throw new Error('File exceeds 10MB limit.');
      }

      // Upload is allowed only after mission approval and before completion
      const { data: missionRow, error: missionError } = await supabase
        .from('missions')
        .select('status')
        .eq('id', missionId)
        .single();

      if (missionError) {
        throw new Error(`Failed to validate mission status: ${missionError.message}`);
      }

      const allowedStatuses = new Set(['OPEN', 'APPROVED', 'IN_FLIGHT', 'PENDING_APPROVAL']);
      if (!allowedStatuses.has(missionRow.status)) {
        throw new Error('Image upload is allowed only for open inspections');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${missionId}/${uuidv4()}.${fileExt}`;

      // Get image dimensions
      const { width, height } = await getImageDimensions(file);

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('mission_images')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      // Create database record
      const { data: imageData, error: dbError } = await supabase
        .from('mission_images')
        .insert({
          mission_id: missionId,
          // Write both fields for backward compatibility with existing DB schema
          storage_path: fileName,
          storage_key: fileName,
          content_type: file.type,
          width,
          height,
          uploaded_by_user_id: user.id,
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database insert error:', dbError);
        throw new Error(`Database record failed: ${dbError.message}`);
      }

      // AI Pipeline: prefer backend CV; if unavailable, fall back to client mock (Gemini)
      if (enableAI && imageData) {
        console.log('[Upload] Starting YOLOv8 AI analysis...');

        // Check backend CV availability first
        const backendAvailable = await checkModelAvailability();

        if (backendAvailable) {
          try {
            const analysis = await analyzeImage(imageData.id);
            console.log('[Upload] AI analysis complete (backend):', analysis);

            const defectCount = analysis.total_detections;
            const failedDetections = analysis.detections.filter(d => d.status === 'FAIL');
            const criticalDefects = failedDetections.filter(d => d.confidence > 0.8).length;

            if (criticalDefects > 0) {
              toast.warning(`AI detected ${criticalDefects} high-confidence defect(s)`, {
                description: `Found: ${failedDetections.map(d => d.class_name).join(', ')}`,
              });
            } else if (failedDetections.length > 0) {
              toast.info(`AI detected ${failedDetections.length} potential defect(s)`, {
                description: 'Review the inspection results for details',
              });
            } else if (defectCount > 0) {
              toast.success('Image uploaded - Panel appears clean');
            } else {
              toast.success('Image uploaded - Analysis complete');
            }
          } catch (aiError) {
            console.error('[Upload] AI processing error (backend):', aiError);
            toast.warning('Image uploaded but AI analysis failed', {
              description: 'Backend CV model encountered an error',
            });
          }
        } else {
          // Backend model not available - run client-side mock analysis (non-persistent)
          try {
            console.log('[Upload] Backend CV unavailable - running client mock analysis');
            const base64 = await preprocessImage(file);
            const detection = await detectDefects(base64, 'RGB');

            // Convert detection result to inspection-result shape and store in client store
            const mapped = (detection.defects || []).map((d) => ({
              mission_id: missionId,
              mission_image_id: imageData.id,
              defect_type: d.type as any,
              confidence: d.confidence,
              bbox_x: d.bbox.x,
              bbox_y: d.bbox.y,
              bbox_width: d.bbox.width,
              bbox_height: d.bbox.height,
              description: d.description,
              overall_condition: detection.overallCondition,
              recommended_action: detection.recommendedAction,
              created_at: new Date().toISOString(),
            }));

            if (mapped.length > 0) {
              // save to client store (not persisted to backend DB)
              await createInspection.mutationFn(mapped as any);
              toast.info('Image uploaded - using client AI fallback (not persisted)');
            } else {
              // No defects returned from client AI - run a quick local heuristic (edge detection)
              try {
                const heuristic = await detectHighEdgeDensity(file);
                if (heuristic.isLikelyDefect) {
                  const auto = [{
                    mission_id: missionId,
                    mission_image_id: imageData.id,
                    defect_type: 'CRACK',
                    confidence: Math.min(0.99, 0.6 + heuristic.edgeRatio * 100),
                    bbox_x: 0,
                    bbox_y: 0,
                    bbox_width: 0,
                    bbox_height: 0,
                    description: `Client heuristic detected edges (ratio=${heuristic.edgeRatio.toFixed(3)}, avgMag=${heuristic.avgMagnitude.toFixed(1)})`,
                    overall_condition: 'POOR',
                    recommended_action: 'Review image - possible structural damage',
                    created_at: new Date().toISOString(),
                  }];

                  await createInspection.mutationFn(auto as any);
                  toast.warning('Image uploaded - client heuristic detected a probable defect (local check)');
                } else {
                  toast.success('Image uploaded - client AI found no defects');
                }
              } catch (heurErr) {
                console.error('Heuristic check failed:', heurErr);
                toast.success('Image uploaded - client AI found no defects');
              }
            }
          } catch (err) {
            console.error('[Upload] client mock analysis failed:', err);
            toast.warning('Image uploaded but client AI analysis failed');
          }
        }
      }

      return imageData;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mission-images', variables.missionId] });
      // Show success toast (AI handler will show its own toasts if enabled)
      if (!variables.enableAI) {
        toast.success('Image uploaded successfully!');
      }
    },
    onError: (error: any) => {
      console.error('Full upload error details:', error);
      const errorMessage = error?.message || 'Failed to upload image';
      toast.error(errorMessage);
    },
  });
}

export function useDeleteMissionImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ imageId, missionId }: { imageId: string; missionId: string }) => {
      const resp = await apiFetch(`${API_BASE_URL}/mission-images/${imageId}`, {
        method: 'DELETE',
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Failed to delete image: ${text}`);
      }
      return await resp.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['mission-images', vars.missionId] });
      toast.success('Image deleted');
    },
    onError: (err) => {
      console.error('Delete image error:', err);
      toast.error('Failed to delete image');
    },
  });
}

export function useCreateMission() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const extractErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;

    if (error && typeof error === 'object') {
      const maybe = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
      const parts = [maybe.message, maybe.details, maybe.hint, maybe.code]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      if (parts.length > 0) return parts.join(' | ');

      try {
        return JSON.stringify(error);
      } catch {
        return 'Unknown error';
      }
    }

    return 'Unknown error';
  };

  return useMutation({
    mutationFn: async (mission: { panel_id: string }) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const supabasePayload = {
        id: uuidv4(),
        panel_id: mission.panel_id,
        status: 'OPEN' as const,
      };

      const backendPayload = {
        panel_id: mission.panel_id,
        status: 'OPEN' as const,
      };

      const { error } = await supabase
        .from('missions')
        .insert(supabasePayload)
        .select('id')
        .single();

      if (!error) return;

      const message = extractErrorMessage(error);
      const code = (error as any)?.code as string | undefined;
      const isRlsIssue =
        code === '42501' ||
        message.toLowerCase().includes('row-level security') ||
        message.toLowerCase().includes('permission denied');

      if (!isRlsIssue) {
        throw new Error(message);
      }

      // Fallback: create mission through backend API (direct DB connection) when Supabase RLS blocks inserts.
      const response = await apiFetch(`${API_BASE_URL}/missions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendPayload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Supabase blocked insert (${message}) and backend fallback failed: ${text}`);
      }

      await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      toast.success('Mission created successfully!');
    },
    onError: (error) => {
      console.error('Error creating mission:', error);
      const message = extractErrorMessage(error);
      toast.error(`Failed to create mission: ${message}`);
    },
  });
}

