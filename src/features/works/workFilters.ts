import type { FreeCategory, WorkRoom, WorkGenre, WorkStatus } from "../../shared/work";

export interface WorkFilters {
  status: "all" | WorkStatus;
  genre: "all" | "ci" | WorkGenre | FreeCategory;
  room?: "all" | WorkRoom;
  tag: string;
  query?: string;
}
