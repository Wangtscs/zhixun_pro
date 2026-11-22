import { QUESTIONS, ANSWERS } from './ProfileData';

export class ProfileLogic {
  static matches(index: number, search: string): boolean {
    const query = search.trim();
    return QUESTIONS[index].includes(query) || ANSWERS[index].includes(query);
  }
  static canPreview(description: string): boolean { return description.trim().length >= 5; }
}
