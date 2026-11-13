'use client';

import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { Button } from '@medicore/ui';
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
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => exportLedger(full, 'csv', `${baseName}.csv`)}>
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Excel / CSV
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => exportLedger(full, 'pdf', `${baseName}.pdf`)}>
        <Printer className="mr-2 h-4 w-4" />
        Print / PDF
      </Button>
      {statement && (
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => exportLedger(full, 'statement', `${baseName}-statement.pdf`)}>
          <FileText className="mr-2 h-4 w-4" />
          Statement
        </Button>
      )}
    </div>
  );
}
