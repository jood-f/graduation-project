import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Search, Filter, Eye } from 'lucide-react';
import { mockPanels, mockSites } from '@/data/mockData';
import type { PanelStatus } from '@/types';
import { cn } from '@/lib/utils';

const statusStyles: Record<PanelStatus, string> = {
  OK: 'bg-success/10 text-success border-success/20',
  WARNING: 'bg-warning/10 text-warning border-warning/20',
  FAULT: 'bg-destructive/10 text-destructive border-destructive/20',
};

export default function Panels() {
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredPanels = useMemo(() => {
    return mockPanels.filter(panel => {
      const matchesSearch = 
        panel.label.toLowerCase().includes(search.toLowerCase()) ||
        panel.serialNumber.toLowerCase().includes(search.toLowerCase());
      const matchesSite = siteFilter === 'all' || panel.siteId === siteFilter;
      const matchesStatus = statusFilter === 'all' || panel.status === statusFilter;
      return matchesSearch && matchesSite && matchesStatus;
    });
  }, [search, siteFilter, statusFilter]);

  return (
    <MainLayout title="Panels">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>All Panels ({filteredPanels.length})</CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search panels..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-[200px]"
                />
              </div>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="OK">OK</SelectItem>
                  <SelectItem value="WARNING">Warning</SelectItem>
                  <SelectItem value="FAULT">Fault</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Serial Number</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Installed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPanels.map(panel => (
                <TableRow key={panel.id}>
                  <TableCell className="font-medium">{panel.label}</TableCell>
                  <TableCell className="text-muted-foreground">{panel.serialNumber}</TableCell>
                  <TableCell>{panel.siteName}</TableCell>
                  <TableCell>{new Date(panel.installedAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge className={cn(statusStyles[panel.status])}>
                      {panel.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredPanels.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              No panels found matching your criteria
            </p>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
