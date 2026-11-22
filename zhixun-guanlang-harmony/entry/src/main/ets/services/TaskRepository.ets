export class TaskDraft {
  completed: number[] = [0, 1];
  photos: string[] = [];
  note: string = '';
  reported: boolean = false;
}

// Session-local demo drafts. Real API/storage can replace this repository.
export class TaskRepository {
  private static drafts: Map<string, TaskDraft> = new Map<string, TaskDraft>();
  static get(nodeId: string): TaskDraft {
    const saved = TaskRepository.drafts.get(nodeId);
    const result = new TaskDraft();
    if (nodeId === 'C-06') { result.completed = [0, 1, 2, 3]; }
    if (saved) {
      result.completed = saved.completed.slice(); result.photos = saved.photos.slice();
      result.note = saved.note; result.reported = saved.reported;
    }
    return result;
  }
  static save(nodeId: string, completed: number[], photos: string[], note: string, reported: boolean): void {
    const draft = new TaskDraft();
    draft.completed = completed.slice(); draft.photos = photos.slice(); draft.note = note; draft.reported = reported;
    TaskRepository.drafts.set(nodeId, draft);
  }
  static reset(nodeId: string): void { TaskRepository.drafts.delete(nodeId); }
}
