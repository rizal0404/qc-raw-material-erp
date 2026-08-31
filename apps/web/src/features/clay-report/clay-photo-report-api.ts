import type {
  ClayPhotoReportDraft,
  ClayPhotoReportImport,
} from "@qc/contracts";
import { apiFetch, apiFetchBlob } from "../../lib/api-client";

const base = "/clay-report-imports";

export const listClayPhotoReports = (crusherId: string) =>
  apiFetch<{ items: ClayPhotoReportImport[] }>(
    `${base}?${new URLSearchParams({ crusherId })}`,
  );

export const getClayPhotoReport = (id: string) =>
  apiFetch<{ item: ClayPhotoReportImport }>(`${base}/${id}`);

export const getClayPhotoReportImage = (id: string, aligned: boolean) =>
  apiFetchBlob(`${base}/${id}/image?aligned=${aligned}`);

export function uploadClayPhotoReport(crusherId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<{ item: ClayPhotoReportImport }>(
    `${base}?${new URLSearchParams({ crusherId })}`,
    { method: "POST", body: form },
  );
}

export const processClayPhotoReport = (id: string) =>
  apiFetch<{ item: ClayPhotoReportImport }>(`${base}/${id}/process`, {
    method: "POST",
    body: JSON.stringify({ acknowledgeExternalVlm: true }),
  });

export const saveClayPhotoDraft = (
  id: string,
  revision: number,
  draft: ClayPhotoReportDraft,
) =>
  apiFetch<{ item: ClayPhotoReportImport }>(`${base}/${id}/draft`, {
    method: "PATCH",
    body: JSON.stringify({ revision, draft }),
  });

export const confirmClayPhotoReport = (
  id: string,
  revision: number,
  draft: ClayPhotoReportDraft,
) =>
  apiFetch<{ item: ClayPhotoReportImport }>(`${base}/${id}/confirm`, {
    method: "POST",
    body: JSON.stringify({ revision, reviewed: true, draft }),
  });

export const reparseClayPhotoReport = (id: string) =>
  apiFetch<{ item: ClayPhotoReportImport }>(`${base}/${id}/reparse`, {
    method: "POST",
    body: JSON.stringify({ acknowledgeExternalVlm: true }),
  });

export const deleteClayPhotoReport = (id: string) =>
  apiFetch<{ ok: true; deletedId: string }>(`${base}/${id}`, {
    method: "DELETE",
  });
