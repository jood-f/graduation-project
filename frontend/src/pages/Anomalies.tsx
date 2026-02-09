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
import { AlertTriangle, Thermometer, Zap, HelpCircle, Check, Eye } from 'lucide-react';
import { mockAnomalies, mockSites } from '@/data/mockData';
import type { AnomalyType, AnomalySeverity, AnomalyStatus } from '@/types';
import { cn } from '@/lib/utils';

const typeIcons: Record<AnomalyType, React.ElementType> = {
  POWER_DROP: Zap,
  OVERHEAT: Thermometer,
  ML_FLAG: AlertTriangle,
  OTHER: HelpCircle,
};

const severityStyles: Record<AnomalySeverity, string> = {
  LOW: 'bg-info/10 text-info border-info/20',
  MED: 'bg-warning/10 text-warning border-warning/20',
  HIGH: 'bg-destructive/10 text-destructive border-destructive/20',
};

const statusStyles: Record<AnomalyStatus, string> = {
  OPEN: 'bg-destructive/10 text-destructive border-destructive/20',
  ACKED: 'bg-warning/10 text-warning border-warning/20',
  CLOSED: 'bg-success/10 text-success border-success/20',
};

export default function Anomalies() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');

  const filteredAnomalies = useMemo(() => {
    return mockAnomalies.filter(anomaly => {
      const matchesStatus = statusFilter === 'all' || anomaly.status === statusFilter;
      const matchesSeverity = severityFilter === 'all' || anomaly.severity === severityFilter;
      const matchesSite = siteFilter === 'all' || anomaly.siteName === mockSites.find(s => s.id === siteFilter)?.name;
      return matchesStatus && matchesSeverity && matchesSite;
    });
  }, [statusFilter, severityFilter, siteFilter]);

  return (
    <MainLayout title="Anomalies">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>All Anomalies ({filteredAnomalies.length})</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="ACKED">Acknowledged</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
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
                  {mockSites.map(site => (
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Panel</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAnomalies.map(anomaly => {
                const TypeIcon = typeIcons[anomaly.type];
                return (
                  <TableRow key={anomaly.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <TypeIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{anomaly.type.replace('_', ' ')}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{anomaly.panelLabel}</TableCell>
                    <TableCell>{anomaly.siteName}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={anomaly.message}>
                      {anomaly.message}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(severityStyles[anomaly.severity])}>
                        {anomaly.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(statusStyles[anomaly.status])}>
                        {anomaly.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(anomaly.ts).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {anomaly.status === 'OPEN' && (
                          <Button variant="ghost" size="sm" title="Acknowledge">
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" title="View Details">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filteredAnomalies.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              No anomalies found matching your criteria
            </p>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
