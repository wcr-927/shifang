import type { CiWorkRecord } from "../../shared/work";
import { desktopApi } from "../../services/desktopApi";
import { useDocumentSession } from "./useDocumentSession";

export function useCiEditor(work: CiWorkRecord) {
  return useDocumentSession(work, snapshot => desktopApi.works.saveCiWork({
    workId: snapshot.id, title: snapshot.title, body: snapshot.body, notes: snapshot.notes, assistance: snapshot.assistance,
    ci: snapshot.ci, status: snapshot.status,
  }));
}
