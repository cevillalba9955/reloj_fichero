import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Nombre de archivo seguro para filesystem: sustituye caracteres invalidos
// en Windows/Unix (":", "/", etc.) que pueden aparecer en un host IPv6 o en
// un timestamp ISO.
function safeFileNamePart(value) {
  return String(value).replace(/[^a-zA-Z0-9.-]/g, '_');
}

// Exporta el resultado de una sesion de consulta a un archivo JSON local
// segun contracts/output-schema.json (FR-006). No escribe en Oracle en esta
// version.
export function exportSessionToJson({ session, records, outputDir }) {
  mkdirSync(outputDir, { recursive: true });

  const fileName = `fichadas-${safeFileNamePart(session.deviceHost)}-${safeFileNamePart(session.startedAt)}.json`;
  const outputFilePath = join(outputDir, fileName);

  const document = {
    sessionId: session.sessionId,
    deviceHost: session.deviceHost,
    devicePort: session.devicePort,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    declaredPendingCount: session.declaredPendingCount,
    receivedRecordCount: records.length,
    status: session.status,
    errorReason: session.errorReason ?? null,
    records: records.map((record) => ({
      rawHex: record.rawHex,
      recordTypeConstant: record.recordTypeConstant,
      verificationMethodCode: record.verificationMethodCode,
      verificationMethodLabel: record.verificationMethodLabel,
      timestampHypothesis: record.timestampHypothesis,
      unresolvedFields: record.unresolvedFields,
    })),
  };

  writeFileSync(outputFilePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return outputFilePath;
}
