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
      // Campos legibles primero (FR-005/FR-015): fecha/hora/legajo/metodo.
      // Un valor presente tiene evidencia real detras; null significa que
      // no se pudo resolver o que se sabe que no es confiable para ese
      // caso puntual (ver research.md §5.9/§5.11/§5.16) — nunca se
      // presenta un valor sin evidencia como si fuera confiable.
      fecha: record.fecha,
      hora: record.hora,
      legajo: record.legajo,
      metodo: record.metodo,
      // Campos tecnicos crudos, para trazabilidad y diagnostico.
      rawHex: record.rawHex,
      recordTypeConstant: record.recordTypeConstant,
      verificationMethodCode: record.verificationMethodCode,
      unresolvedFields: record.unresolvedFields,
    })),
  };

  writeFileSync(outputFilePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return outputFilePath;
}
