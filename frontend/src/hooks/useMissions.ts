import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { detectDefects, preprocessImage } from '@/lib/gemini';
import { useCreateInspectionResults } from '@/hooks/useAI';

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
  created_by_user_id: string;
}

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
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Mission[];
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
            .from('mission-images')
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
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (missionId: string) => {
      const { error } = await supabase
        .from('missions')
        .update({
          status: 'APPROVED',
          approved_by_user_id: user?.id,
          approved_by_name: user?.name,
          approved_at: new Date().toISOString(),
        })
        .eq('id', missionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      toast.success('Mission approved successfully!');
    },
    onError: (error) => {
      console.error('Error approving mission:', error);
      toast.error('Failed to approve mission');
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
  const createInspectionResults = useCreateInspectionResults();

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

      const fileExt = file.name.split('.').pop();
      const fileName = `${missionId}/${uuidv4()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('mission-images')
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
          storage_path: fileName,
          content_type: file.type,
          uploaded_by_user_id: user.id,
        })
        .select()
        .single();

      if (dbError) {
        console.error('Database insert error:', dbError);
        throw new Error(`Database record failed: ${dbError.message}`);
      }

      // AI Pipeline 2: Vision-Based Defect Detection
      if (enableAI && imageData) {
        console.log('[Upload] Starting AI analysis...');
        try {
          // Check if Gemini API key is configured
          if (!import.meta.env.VITE_GEMINI_API_KEY) {
            console.warn('[Upload] Gemini API key not configured, skipping AI analysis');
            toast.info('Image uploaded (AI disabled - missing API key)');
          } else {
            try {
              console.log('[Upload] Preprocessing image...');
              // Preprocess image (resize to 1024px, base64 encode)
              const imageBase64 = await preprocessImage(file);
              console.log('[Upload] Image preprocessed, calling Gemini...');
              
              // Determine image type based on filename or metadata
              const imageType: 'RGB' | 'THERMAL' = 
                file.name.toLowerCase().includes('thermal') ? 'THERMAL' : 'RGB';

              // Detect defects using Gemini 1.5 Pro
              const analysis = await detectDefects(imageBase64, imageType);
              console.log('[Upload] AI analysis complete:', analysis);

              // Store inspection results if defects found
              if (analysis.defects.length > 0) {
                console.log(`[Upload] Saving ${analysis.defects.length} defects to database...`);
                const inspectionResults = analysis.defects.map(defect => ({
                  mission_id: missionId,
                  mission_image_id: imageData.id,
                  defect_type: defect.type,
                  confidence: defect.confidence,
                  bbox_x: defect.bbox.x,
                  bbox_y: defect.bbox.y,
                  bbox_width: defect.bbox.width,
                  bbox_height: defect.bbox.height,
                  description: defect.description,
                  overall_condition: analysis.overallCondition,
                  recommended_action: analysis.recommendedAction,
                }));

                await createInspectionResults.mutateAsync(inspectionResults);
                console.log('[Upload] Inspection results saved successfully');
                
                // Show defect summary
                const defectCount = analysis.defects.length;
                const criticalDefects = analysis.defects.filter(d => d.confidence > 0.8).length;
                
                if (criticalDefects > 0) {
                  toast.warning(`AI detected ${criticalDefects} high-confidence defect(s)`, {
                    description: `Overall condition: ${analysis.overallCondition}`,
                  });
                } else if (defectCount > 0) {
                  toast.info(`AI detected ${defectCount} potential defect(s)`, {
                    description: 'Review the inspection results for details',
                  });
                }
              } else {
                console.log('[Upload] AI found no defects');
                toast.success('Image uploaded - No defects detected by AI');
              }
            } catch (aiError) {
              console.error('[Upload] AI processing error:', aiError);
              toast.warning('Image uploaded but AI analysis failed', {
                description: 'Manual inspection recommended',
              });
            }
          }
        } catch (error) {
          console.error('Unexpected AI error:', error);
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

export function useCreateMission() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (mission: { panel_id: string; panel_label: string; site_name: string }) => {
      const { error } = await supabase
        .from('missions')
        .insert({
          ...mission,
          created_by_user_id: user?.id,
          status: 'PENDING_APPROVAL',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      toast.success('Mission created successfully!');
    },
    onError: (error) => {
      console.error('Error creating mission:', error);
      toast.error('Failed to create mission');
    },
  });
}
