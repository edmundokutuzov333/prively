import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";

function csvEscape(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return '"' + raw.replaceAll('"','""') + '"';
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ code: "method_not_allowed" }, 405);

  try {
    const { client, user } = await requireUser(request);
    const body = await request.json() as {
      format?: unknown;
      receiptId?: unknown;
    };

    const format = body.format === "csv" || body.format === "receipt_pdf"
      ? body.format
      : null;

    if (!format) return jsonResponse({ code: "invalid_export_format" }, 400);

    const admin = serviceClient();

    if (format === "receipt_pdf") {
      if (typeof body.receiptId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.receiptId)) {
        return jsonResponse({ code: "invalid_receipt_id" }, 400);
      }

      const { data: receipt, error } = await admin
        .from("receipts")
        .select("id,receipt_number,user_id,txn_id,kind,amount,currency,created_at,metadata")
        .eq("id", body.receiptId)
        .single();

      if (error || !receipt) return jsonResponse({ code: "receipt_not_found" }, 404);

      const { data: roleRows, error: roleError } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (roleError) return jsonResponse({ code: "role_lookup_failed" }, 500);

      const privileged = (roleRows ?? []).some((row) => row.role === "finance" || row.role === "admin");
      if (receipt.user_id !== user.id && !privileged) {
        return jsonResponse({ code: "forbidden" }, 403);
      }

      const { PDFDocument, StandardFonts, rgb } = await import("npm:pdf-lib@1.17.1");
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595, 842]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

      page.drawText("Prively", { x: 48, y: 790, size: 20, font: bold, color: rgb(0.45,0.03,0.10) });
      page.drawText("Recibo financeiro", { x: 48, y: 755, size: 15, font: bold });
      page.drawText("Número: " + (receipt.receipt_number ?? receipt.id), { x: 48, y: 725, size: 10, font });
      page.drawText("Transacção: " + receipt.txn_id, { x: 48, y: 705, size: 10, font });
      page.drawText("Tipo: " + receipt.kind, { x: 48, y: 685, size: 10, font });
      page.drawText(
        "Valor: " + new Intl.NumberFormat("pt-PT").format(Number(receipt.amount) / 100) + " " + receipt.currency,
        { x: 48, y: 665, size: 14, font: bold }
      );
      page.drawText(
        "Emitido: " + new Date(receipt.created_at).toLocaleString("pt-PT", { timeZone: "Africa/Maputo" }),
        { x: 48, y: 640, size: 10, font }
      );
      page.drawText("Documento gerado a partir do registo financeiro real da Prively.", { x: 48, y: 590, size: 10, font });

      const bytes = await pdf.save();
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="prively-' + (receipt.receipt_number ?? receipt.id) + '.pdf"',
          "Cache-Control": "private, no-store",
        },
      });
    }

    const { data: ledger, error: ledgerError } = await admin
      .from("ledger_entries")
      .select("id,txn_id,account,amount,kind,ref_type,ref_id,created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (ledgerError) return jsonResponse({ code: "financial_export_failed" }, 500);

    const rows = [
      ["ID","Transacção","Conta","Valor MZN","Tipo","Referência","Data"],
      ...(ledger ?? []).map((row) => [
        row.id,
        row.txn_id,
        row.account,
        (Number(row.amount) / 100).toFixed(2),
        row.kind,
        row.ref_id ?? row.ref_type ?? "",
        new Date(row.created_at).toISOString(),
      ]),
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    return new Response("\ufeff" + csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="prively-historico-financeiro.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "financial_export_error";
    return jsonResponse({ code }, code === "unauthorized" ? 401 : 400);
  }
});
