import type React from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';

export const ContractingHomePage: React.FC = () => (
  <main className="p-4 md:p-6">
    <Card>
      <CardHeader>
        <CardTitle>Jedidiah Contracting</CardTitle>
        <CardDescription>Your Contracting access is active.</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        Contracting workflows will appear here as they are released.
      </CardContent>
    </Card>
  </main>
);
