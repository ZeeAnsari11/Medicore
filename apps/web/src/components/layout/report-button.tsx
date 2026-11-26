'use client';

import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@medicore/ui';
import { exportToCsv } from '@/lib/export-csv';
import { useAuth } from '@/hooks/use-auth';
import { useBranches } from '@/hooks/use-branches';
import { useBranchFilter } from '@/hooks/use-branch-filter';

type Cell = string | number | null | undefined;

interface ReportButtonProps {
  /** Heading of the printed report and the base of the file name. */
  title: string;
  /** One object per row; the keys of the first row are the column headings. */
  rows: Array<Record<string, Cell>>;
  /** The period the rows cover (shown top right), e.g. "All dates" or "2026-11-01 to 2026-11-30". */
  subtitle?: string;
  /** Report-specific lines shown top left, like "Status: Active" (the filters that were applied). */
  info?: string[];
  /** Extra label/value pairs printed above the table, e.g. the overview totals. */
  summary?: Array<[string, Cell]>;
  disabled?: boolean;
  /** Columns to add up: a Total row is added under the table (in the file and the printout). */
  totalColumns?: string[];
  /** Called to get the rows when they need to be fetched at click time (e.g. a paged list). */
  getRows?: () => Promise<Array<Record<string, Cell>>>;
}

const esc = (v: Cell) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Opens the report in a print-ready tab: the browser's Print dialog offers "Save as PDF". */
const toNumber = (v: Cell): number => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '')) || 0);

/** The "Total" row for the chosen columns, formatted like the column it adds up (two decimals when it has them). */
function totalsRow(rows: Array<Record<string, Cell>>, columns: string[] | undefined): Record<string, Cell> | null {
  if (!columns?.length || rows.length === 0) return null;
  const heads = Object.keys(rows[0]);
  const row: Record<string, Cell> = {};
  heads.forEach((h, i) => {
    if (columns.includes(h)) {
      const sum = Math.round(rows.reduce((n, r) => n + toNumber(r[h]), 0) * 100) / 100;
      const decimals = rows.some((r) => typeof r[h] === 'string' && /\.\d/.test(r[h] as string));
      row[h] = decimals ? sum.toFixed(2) : sum;
    } else row[h] = i === 0 ? 'Total' : '';
  });
  return row;
}

function printReport(
  title: string,
  header: { business: string; period: string; branch: string; info: string[] },
  summary: ReportButtonProps['summary'],
  rows: Array<Record<string, Cell>>,
  total: Record<string, Cell> | null,
) {
  const win = window.open('', '_blank');
  if (!win) return;
  const heads = Object.keys(rows[0] ?? {});
  const numeric = (v: Cell) => typeof v === 'number' || (typeof v === 'string' && /^-?[\d,]+(\.\d+)?$/.test(v.trim()));
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:12px/1.4 system-ui,sans-serif;margin:24px;color:#111}
    .biz{text-align:center;font-size:26px;margin:0}.ttl{text-align:center;font-size:18px;margin:4px 0 14px}
    .meta{display:flex;justify-content:space-between;gap:24px;font-size:13px;padding-bottom:8px;border-bottom:3px solid #000;margin-bottom:14px}
    .meta .r{text-align:right}
    @page{@bottom-right{content:"Page " counter(page) " of " counter(pages);font-size:10px;color:#555}}
    .sum{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-bottom:12px}.sum div{border:1px solid #ccc;border-radius:4px;padding:6px 10px}
    .sum b{display:block;font-size:14px}.sum span{font-size:10px;text-transform:uppercase;color:#555}
    table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}
    tfoot td{font-weight:700;border-top:2px solid #999;border-bottom:none}
    th{background:#f3f4f6;font-size:11px}td.n,th.n{text-align:right}tr{break-inside:avoid}thead{display:table-header-group}
    .foot{margin-top:10px;color:#777;font-size:10px}@media print{body{margin:10mm}}
  </style></head><body>
    <h1 class="biz">${esc(header.business)}</h1>
    <h2 class="ttl">${esc(title)}</h2>
    <div class="meta">
      <div>${header.info.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
      <div class="r"><div>${esc(header.period)}</div><div>${esc(header.branch)}</div></div>
    </div>
    ${summary?.length ? `<div class="sum">${summary.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
    <table><thead><tr>${heads.map((h) => `<th${numeric(rows[0][h]) ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${heads.map((h) => `<td${numeric(r[h]) ? ' class="n"' : ''}>${esc(r[h])}</td>`).join('')}</tr>`).join('')}</tbody>${total ? `<tfoot><tr>${heads.map((h) => `<td${numeric(total[h]) ? ' class="n"' : ''}>${esc(total[h])}</td>`).join('')}</tr></tfoot>` : ''}</table>
    <div class="foot">${rows.length} row${rows.length === 1 ? '' : 's'} · Generated ${new Date().toLocaleString()}</div>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`);
  win.document.close();
}

/** "Download Report": the rows as an Excel/CSV file or a printable PDF. */
export function ReportButton({ title, rows, subtitle, info, summary, disabled, getRows, totalColumns }: ReportButtonProps) {
  const { user } = useAuth();
  const { branches } = useBranches();
  const { branchId } = useBranchFilter();
  const load = async () => (getRows ? getRows() : rows);
  const toCsv = async () => {
    const data = await load();
    const total = totalsRow(data, totalColumns);
    exportToCsv(
      `${slug(title)}.csv`,
      [...data, ...(total ? [total] : [])].map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? '']))),
    );
  };
  const toPdf = async () => {
    const data = await load();
    if (!data.length) return;
    const header = {
      business: user?.tenantName ?? '',
      period: subtitle ?? `As of ${new Date().toLocaleDateString('en-GB')}`,
      branch: branchId ? (branches.find((b) => b.id === branchId)?.name ?? '') : 'All branches',
      info: info ?? [],
    };
    printReport(title, header, summary, data, totalsRow(data, totalColumns));
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || (!getRows && rows.length === 0)}>
          <Download className="mr-2 h-4 w-4" />
          Download Report
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={toCsv}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Excel / CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={toPdf}>
          <Printer className="mr-2 h-4 w-4" />
          Print / PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
