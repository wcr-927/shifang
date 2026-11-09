import { categoryOf, type FreeWorkRecord } from "../../shared/work";
import { desktopApi } from "../../services/desktopApi";
import { useDocumentSession } from "./useDocumentSession";

export function useFreeEditor(work: FreeWorkRecord) {
  return useDocumentSession({ ...work, category: categoryOf(work) }, snapshot => desktopApi.works.saveFreeWork({
    workId: snapshot.id, title: snapshot.title, body: snapshot.body, notes: snapshot.notes, assistance: snapshot.assistance,
    category: snapshot.category, status: snapshot.status,
  }));
}
