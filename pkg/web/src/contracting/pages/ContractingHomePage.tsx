import { Link } from '@tanstack/react-router';
import type React from 'react';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useCan } from '@/hooks/use-access.js';

export const ContractingHomePage: React.FC = () => {
  const canReadFleet = useCan('contracting_machine:read').can;
  return (
    <main className="p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Jedidiah Contracting</CardTitle>
          <CardDescription>Your Contracting access is active.</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {canReadFleet ? (
            <Button render={<Link to="/contracting/fleet" />}>Open fleet</Button>
          ) : (
            'Your assigned Contracting workflows will appear here as they are released.'
          )}
        </CardContent>
      </Card>
    </main>
  );
};
