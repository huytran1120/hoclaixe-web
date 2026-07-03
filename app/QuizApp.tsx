"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { Question } from "./types";

const EXAM_SIZE = 50;
const EXAM_SECONDS = 33 * 60;

type Mode = "study" | "exam";
type ExamStatus = "idle" | "active" | "done";

type ExamResult = {
  correct: number;
  wrong: number;
  unanswered: number;
};

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function shuffleQuestions(questions: Question[]) {
  const copy = [...questions];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function QuestionView({
  question,
  selected,
  reveal,
  onSelect,
}: {
  question: Question;
  selected?: number;
  reveal: boolean;
  onSelect: (option: number) => void;
}) {
  return (
    <article className="question-panel">
      <div className="question-header">
        <span>Câu {question.id}</span>
        <span>{question.chapter}</span>
      </div>

      <h2>{question.prompt}</h2>

      {question.images.length > 0 ? (
        <div className="question-images">
          {question.images.map((image) => (
            <Image
              key={image}
              src={image}
              alt={`Hình minh họa câu ${question.id}`}
              width={900}
              height={520}
              sizes="(max-width: 900px) 100vw, 760px"
              unoptimized
            />
          ))}
        </div>
      ) : null}

      <div className="answer-list">
        {question.options.map((option) => {
          const isSelected = selected === option.id;
          const isCorrect = option.id === question.answer;
          const className = [
            "answer-option",
            isSelected ? "selected" : "",
            reveal && isCorrect ? "correct" : "",
            reveal && isSelected && !isCorrect ? "wrong" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={option.id}
              className={className}
              type="button"
              onClick={() => onSelect(option.id)}
            >
              <span>{option.id}</span>
              <strong>{option.text}</strong>
            </button>
          );
        })}
      </div>

      {reveal ? (
        <p className="answer-note">Đáp án đúng: {question.answer}</p>
      ) : null}
    </article>
  );
}

export default function QuizApp({ questions }: { questions: Question[] }) {
  const [mode, setMode] = useState<Mode>("study");
  const [chapter, setChapter] = useState("Tất cả");
  const [query, setQuery] = useState("");
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyAnswers, setStudyAnswers] = useState<Record<number, number>>({});

  const [examStatus, setExamStatus] = useState<ExamStatus>("idle");
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [examIndex, setExamIndex] = useState(0);
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(EXAM_SECONDS);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);

  const chapters = useMemo(
    () => ["Tất cả", ...Array.from(new Set(questions.map((item) => item.chapter)))],
    [questions],
  );

  const filteredQuestions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return questions.filter((question) => {
      const matchesChapter = chapter === "Tất cả" || question.chapter === chapter;
      const matchesQuery =
        !keyword ||
        question.id.toString() === keyword ||
        question.prompt.toLowerCase().includes(keyword) ||
        question.options.some((option) => option.text.toLowerCase().includes(keyword));
      return matchesChapter && matchesQuery;
    });
  }, [chapter, query, questions]);

  const currentStudyQuestion = filteredQuestions[Math.min(studyIndex, filteredQuestions.length - 1)];
  const currentExamQuestion = examQuestions[examIndex];

  const submitExam = useCallback(() => {
    if (examQuestions.length === 0) {
      return;
    }

    let correct = 0;
    let unanswered = 0;
    for (const question of examQuestions) {
      const answer = examAnswers[question.id];
      if (!answer) {
        unanswered += 1;
      } else if (answer === question.answer) {
        correct += 1;
      }
    }

    setExamResult({
      correct,
      unanswered,
      wrong: examQuestions.length - correct - unanswered,
    });
    setExamStatus("done");
    setExamIndex(0);
  }, [examAnswers, examQuestions]);

  useEffect(() => {
    if (examStatus !== "active") {
      return;
    }
    if (timeLeft <= 0) {
      const timeout = window.setTimeout(submitExam, 0);
      return () => window.clearTimeout(timeout);
    }

    const timer = window.setInterval(() => {
      setTimeLeft((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [examStatus, submitExam, timeLeft]);

  const startExam = () => {
    const picked = shuffleQuestions(questions).slice(0, EXAM_SIZE);
    setExamQuestions(picked);
    setExamAnswers({});
    setExamResult(null);
    setExamIndex(0);
    setTimeLeft(EXAM_SECONDS);
    setExamStatus("active");
    setMode("exam");
  };

  const answeredCount = Object.keys(examAnswers).length;
  const scorePercent = examResult
    ? Math.round((examResult.correct / examQuestions.length) * 100)
    : 0;

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">600 câu hỏi sát hạch lái xe</p>
          <h1>Ôn tập và thi thử lý thuyết</h1>
        </div>
        <div className="mode-switch" aria-label="Chọn chế độ">
          <button
            className={mode === "study" ? "active" : ""}
            type="button"
            onClick={() => setMode("study")}
          >
            Ôn tập
          </button>
          <button
            className={mode === "exam" ? "active" : ""}
            type="button"
            onClick={() => setMode("exam")}
          >
            Thi thử
          </button>
        </div>
      </section>

      {mode === "study" ? (
        <section className="workspace">
          <aside className="sidebar">
            <div className="field-stack">
              <label htmlFor="chapter">Chương</label>
              <select
                id="chapter"
                value={chapter}
                onChange={(event) => {
                  setChapter(event.target.value);
                  setStudyIndex(0);
                }}
              >
                {chapters.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-stack">
              <label htmlFor="search">Tìm câu</label>
              <input
                id="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setStudyIndex(0);
                }}
                placeholder="Nhập số câu hoặc từ khóa"
              />
            </div>

            <div className="stat-grid">
              <div>
                <span>{filteredQuestions.length}</span>
                <p>Câu phù hợp</p>
              </div>
              <div>
                <span>{Object.keys(studyAnswers).length}</span>
                <p>Đã làm</p>
              </div>
            </div>

            <div className="question-grid" aria-label="Danh sách câu hỏi">
              {filteredQuestions.map((question, index) => (
                <button
                  key={question.id}
                  className={[
                    index === studyIndex ? "current" : "",
                    studyAnswers[question.id] ? "answered" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  onClick={() => setStudyIndex(index)}
                >
                  {question.id}
                </button>
              ))}
            </div>
          </aside>

          <section className="main-column">
            {currentStudyQuestion ? (
              <>
                <QuestionView
                  question={currentStudyQuestion}
                  selected={studyAnswers[currentStudyQuestion.id]}
                  reveal={Boolean(studyAnswers[currentStudyQuestion.id])}
                  onSelect={(option) =>
                    setStudyAnswers((value) => ({
                      ...value,
                      [currentStudyQuestion.id]: option,
                    }))
                  }
                />
                <div className="pager">
                  <button
                    type="button"
                    disabled={studyIndex === 0}
                    onClick={() => setStudyIndex((value) => Math.max(0, value - 1))}
                  >
                    Trước
                  </button>
                  <span>
                    {studyIndex + 1} / {filteredQuestions.length}
                  </span>
                  <button
                    type="button"
                    disabled={studyIndex >= filteredQuestions.length - 1}
                    onClick={() =>
                      setStudyIndex((value) => Math.min(filteredQuestions.length - 1, value + 1))
                    }
                  >
                    Tiếp
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">Không tìm thấy câu hỏi phù hợp.</div>
            )}
          </section>
        </section>
      ) : (
        <section className="workspace">
          <aside className="sidebar">
            <button className="primary-action" type="button" onClick={startExam}>
              Bắt đầu đề mới
            </button>

            <div className="exam-card">
              <span>Thời gian</span>
              <strong>{formatTime(timeLeft)}</strong>
              <p>
                {answeredCount} / {examQuestions.length || EXAM_SIZE} câu đã chọn
              </p>
            </div>

            {examResult ? (
              <div className="result-card">
                <span>Kết quả</span>
                <strong>{scorePercent}%</strong>
                <p>Đúng {examResult.correct}, sai {examResult.wrong}, bỏ trống {examResult.unanswered}</p>
              </div>
            ) : null}

            {examQuestions.length > 0 ? (
              <div className="question-grid" aria-label="Danh sách câu trong đề">
                {examQuestions.map((question, index) => (
                  <button
                    key={question.id}
                    className={[
                      index === examIndex ? "current" : "",
                      examAnswers[question.id] ? "answered" : "",
                      examStatus === "done" && examAnswers[question.id] === question.answer ? "correct-dot" : "",
                      examStatus === "done" && examAnswers[question.id] && examAnswers[question.id] !== question.answer
                        ? "wrong-dot"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    type="button"
                    onClick={() => setExamIndex(index)}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            ) : null}
          </aside>

          <section className="main-column">
            {examStatus === "idle" ? (
              <div className="start-panel">
                <h2>Đề thi thử 50 câu trong 33 phút</h2>
                <p>
                  Mỗi đề được chọn ngẫu nhiên từ toàn bộ 600 câu, bao gồm cả câu chữ,
                  biển báo và sa hình trong tài liệu.
                </p>
                <button type="button" onClick={startExam}>
                  Tạo đề ngẫu nhiên
                </button>
              </div>
            ) : currentExamQuestion ? (
              <>
                <QuestionView
                  question={currentExamQuestion}
                  selected={examAnswers[currentExamQuestion.id]}
                  reveal={examStatus === "done"}
                  onSelect={(option) => {
                    if (examStatus === "done") {
                      return;
                    }
                    setExamAnswers((value) => ({
                      ...value,
                      [currentExamQuestion.id]: option,
                    }));
                  }}
                />
                <div className="pager">
                  <button
                    type="button"
                    disabled={examIndex === 0}
                    onClick={() => setExamIndex((value) => Math.max(0, value - 1))}
                  >
                    Trước
                  </button>
                  <span>
                    {examIndex + 1} / {examQuestions.length}
                  </span>
                  <button
                    type="button"
                    disabled={examIndex >= examQuestions.length - 1}
                    onClick={() => setExamIndex((value) => Math.min(examQuestions.length - 1, value + 1))}
                  >
                    Tiếp
                  </button>
                  {examStatus === "active" ? (
                    <button className="submit-button" type="button" onClick={submitExam}>
                      Nộp bài
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </section>
        </section>
      )}
    </main>
  );
}
