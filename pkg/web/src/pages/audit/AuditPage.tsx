import type React from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { AuditTable } from './components/AuditTable.js';

export const AuditPage: React.FC = () => (
  <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardDescription>History</CardDescription>
          <CardTitle>Audit Log</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Separator />
        <AuditTable />
      </CardContent>
    </Card>
  </div>
);
