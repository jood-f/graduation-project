import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Eye } from 'lucide-react';
import { useFaults } from '@/hooks/useFaults';
import { useSites } from '@/hooks/useSites';
import { cn } from '@/lib/utils';

// Confidence to severity mapping
function getSeverity(confidence: number): 'LOW' | 'MED' | 'HIGH' {
  if (confidence >= 0.85) return 'HIGH';
  if (confidence >= 0.7) return 'MED';
  return 'LOW';
}

const severityStyles = {
  LOW: 'bg-info/10 text-info border-info/20',
  MED: 'bg-warning/10 text-warning border-warning/20',
  HIGH: 'bg-destructive/10 text-destructive border-destructive/20',
};

export default function Anomalies() {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');

  const { data: faults, isLoading } = useFaults();
  const { data: sites } = useSites();

  const filteredFaults = useMemo(() => {
    if (!faults) return [];
    return faults.filter(fault => {
      const severity = getSeverity(fault.confidence);
      const matchesSeverity = severityFilter === 'all' || severity === severityFilter;
      const matchesSite = siteFilter === 'all' || fault.site_name === sites?.find(s => s.id === siteFilter)?.name;
      return matchesSeverity && matchesSite;
    });
  }, [faults, severityFilter, siteFilter, sites]);

  return (
    <MainLayout title="Anomalies">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Detected Faults ({filteredFaults.length})</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MED">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites?.map(site => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Panel</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Detected</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFaults.map(fault => {
                const severity = getSeverity(fault.confidence);
                return (
                  <TableRow key={fault.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{fault.fault_type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{fault.panel_label}</TableCell>
                    <TableCell>{fault.site_name}</TableCell>
                    <TableCell>{(fault.confidence * 100).toFixed(0)}%</TableCell>
                    <TableCell>
                      <Badge className={cn(severityStyles[severity])}>
                        {severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(fault.detected_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" title="View Details">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          )}
          {!isLoading && filteredFaults.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              No faults found matching your criteria
            </p>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
