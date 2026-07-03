import QuizApp from "./QuizApp";
import questionsData from "./data/questions.json";
import type { Question } from "./types";

export default function Home() {
  return <QuizApp questions={questionsData as Question[]} />;
}
