export type QuestionOption = {
  id: number;
  text: string;
};

export type Question = {
  id: number;
  prompt: string;
  options: QuestionOption[];
  chapter: string;
  images: string[];
  answer: number;
};
