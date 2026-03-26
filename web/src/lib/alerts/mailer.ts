import nodemailer from "nodemailer";

type DigestItem = {
  id: string;
  title: string;
  organization: string | null;
  publicationDate: string | null;
  sourceUrl: string | null;
};

type DigestProfile = {
  profileId: number;
  profileName: string;
  newItems: DigestItem[];
};

type SendWeeklyDigestInput = {
  runId: string;
  runAtIso: string;
  profiles: DigestProfile[];
};

export type SendWeeklyDigestResult = {
  status: "sent" | "error";
  message: string;
};

function parseRecipients(): string[] {
  const raw = process.env.ALERT_RECIPIENTS ?? "";
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildTextBody(input: SendWeeklyDigestInput): string {
  const lines: string[] = [];
  lines.push("Resumen semanal de alertas - api-ayudas");
  lines.push(`Run ID: ${input.runId}`);
  lines.push(`Fecha ejecución: ${input.runAtIso}`);
  lines.push("");

  for (const profile of input.profiles) {
    lines.push(`Perfil: ${profile.profileName} (ID ${profile.profileId})`);
    lines.push(`Novedades: ${profile.newItems.length}`);

    for (const item of profile.newItems) {
      lines.push(`- ${item.title}`);
      lines.push(`  ID: ${item.id}`);
      if (item.organization) lines.push(`  Organismo: ${item.organization}`);
      if (item.publicationDate) lines.push(`  Publicación: ${item.publicationDate}`);
      if (item.sourceUrl) lines.push(`  Fuente: ${item.sourceUrl}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

function buildHtmlBody(input: SendWeeklyDigestInput): string {
  const sections = input.profiles
    .map((profile) => {
      const items = profile.newItems
        .map((item) => {
          const sourceLink = item.sourceUrl
            ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">Ver convocatoria</a>`
            : "Sin enlace oficial";

          return `
            <li style="margin-bottom:10px;">
              <strong>${escapeHtml(item.title)}</strong><br/>
              ID: ${escapeHtml(item.id)}<br/>
              Organismo: ${escapeHtml(item.organization ?? "No informado")}<br/>
              Publicación: ${escapeHtml(item.publicationDate ?? "No informada")}<br/>
              ${sourceLink}
            </li>
          `;
        })
        .join("");

      return `
        <section style="margin-bottom:16px;">
          <h3 style="margin:0 0 8px 0;">${escapeHtml(profile.profileName)} (ID ${profile.profileId})</h3>
          <p style="margin:0 0 8px 0;">Novedades: ${profile.newItems.length}</p>
          <ul style="margin:0; padding-left:18px;">${items}</ul>
        </section>
      `;
    })
    .join("");

  return `
    <div style="font-family:Arial,sans-serif; color:#111827;">
      <h2 style="margin:0 0 12px 0;">Resumen semanal de alertas - api-ayudas</h2>
      <p style="margin:0 0 8px 0;"><strong>Run ID:</strong> ${escapeHtml(input.runId)}</p>
      <p style="margin:0 0 16px 0;"><strong>Fecha ejecución:</strong> ${escapeHtml(input.runAtIso)}</p>
      ${sections}
    </div>
  `;
}

export async function sendWeeklyDigestEmail(
  input: SendWeeklyDigestInput
): Promise<SendWeeklyDigestResult> {
  if (input.profiles.length === 0) {
    return { status: "error", message: "Sin perfiles con novedades." };
  }


  const recipients = parseRecipients();
  if (recipients.length === 0) {
    return { status: "error", message: "No hay destinatarios en ALERT_RECIPIENTS." };
  }

  const host = process.env.SMTP_HOST ?? "";
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  const from = process.env.SMTP_FROM ?? "";
  const secure = process.env.SMTP_SECURE === "true";

  if (!host || !port || !user || !pass || !from) {
    return {
      status: "error",
      message: "Configuración SMTP incompleta (SMTP_HOST/PORT/USER/PASS/FROM).",
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    const subject = `[api-ayudas] Resumen semanal (${input.profiles.length} perfiles con novedades)`;

    await transporter.sendMail({
      from,
      to: recipients.join(","),
      subject,
      text: buildTextBody(input),
      html: buildHtmlBody(input),
    });

    return {
      status: "sent",
      message: `Email enviado a ${recipients.length} destinatario(s).`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Error SMTP desconocido.",
    };
  }
}