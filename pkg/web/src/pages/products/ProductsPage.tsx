import type React from "react";

import { Badge } from "@/components/ui/badge.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";
import { Separator } from "@/components/ui/separator.js";

type ProductsPageProps = Record<string, never>;

export const ProductsPage: React.FC<ProductsPageProps> = () => {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <CardDescription>Catalog</CardDescription>
              <CardTitle>Products</CardTitle>
            </div>
            <Badge variant="secondary">Placeholder</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          <p className="max-w-2xl text-sm text-muted-foreground">
            Product catalog management will live here. This placeholder keeps the app shell and
            navigation route in place while product workflows are designed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
