'use client';

import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@medicore/ui';
import { useLedgerExport } from '@/hooks/use-ledgers';
import { usePermissions } from '@/hooks/use-permissions';

interface LedgerExportButtonsProps {
  /** Export permission key, e.g. `acc_general_ledger:export`. */
  permission?: string;
  /** Export route, e.g. `/accounting/customers/:id/ledger/export`. */
  path: string;
  query: Record<string, string | undefined>;
  baseName: string;
  /** Adds the "Statement" PDF for sending to a customer or vendor. */
  statement?: boolean;
  disabled?: boolean;
}

export function LedgerExportButtons({ permission, path, query, baseName, statement, disabled }: LedgerExportButtonsProps) {
  const { has } = usePermissions();
  const { exportLedger, exportQuery } = useLedgerExport();
  const qs = exportQuery({ ...query });
  const full = qs ? `${path}?${qs}` : path;

  if (permission && !has(permission)) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download className="mr-2 h-4 w-4" />
          Download Report
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportLedger(full, 'csv', `${baseName}.csv`)}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Excel / CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportLedger(full, 'pdf', `${baseName}.pdf`)}>
          <Printer className="mr-2 h-4 w-4" />
          Print / PDF
        </DropdownMenuItem>
        {statement && (
          <DropdownMenuItem onClick={() => exportLedger(full, 'statement', `${baseName}-statement.pdf`)}>
            <FileText className="mr-2 h-4 w-4" />
            Statement
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
