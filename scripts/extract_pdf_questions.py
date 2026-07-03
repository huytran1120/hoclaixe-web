from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium


ROOT = Path(__file__).resolve().parents[2]
SITE = Path(__file__).resolve().parents[1]
PDF_PATH = next(ROOT.glob("*.pdf"))
DATA_PATH = SITE / "app" / "data" / "questions.json"
IMAGE_DIR = SITE / "public" / "question-images"

QUESTION_RE = re.compile(r"Câu\s+([0-9 ]{1,5})[\.:]", re.IGNORECASE)
OPTION_MARKER_RE = re.compile(r"(^|\s{2,})([1-4])\.\s+")

CHAPTERS = [
    (1, 180, "Quy định chung và quy tắc giao thông"),
    (181, 205, "Văn hóa giao thông, đạo đức người lái xe"),
    (206, 263, "Kỹ thuật lái xe"),
    (264, 300, "Cấu tạo và sửa chữa"),
    (301, 485, "Báo hiệu đường bộ"),
    (486, 600, "Giải thế sa hình và xử lý tình huống"),
]


def clean_text(value: str) -> str:
    value = re.sub(r"\s+", " ", value)
    value = value.replace(" ,", ",").replace(" .", ".")
    return value.strip()


def normalize_question_number(value: str) -> int:
    return int(re.sub(r"\s+", "", value))


def chapter_for(number: int) -> str:
    for start, end, name in CHAPTERS:
        if start <= number <= end:
            return name
    return "Khác"


def group_lines(words: list[dict]) -> list[dict]:
    lines: list[dict] = []
    for word in sorted(words, key=lambda w: (w["top"], w["x0"])):
        for line in lines:
            if abs(line["top"] - word["top"]) <= 3:
                line["words"].append(word)
                line["top"] = min(line["top"], word["top"])
                line["bottom"] = max(line["bottom"], word["bottom"])
                break
        else:
            lines.append(
                {
                    "top": word["top"],
                    "bottom": word["bottom"],
                    "words": [word],
                }
            )

    for line in lines:
        line["words"].sort(key=lambda w: w["x0"])
        line["x0"] = min(w["x0"] for w in line["words"])
        line["x1"] = max(w["x1"] for w in line["words"])
        line["text"] = " ".join(w["text"] for w in line["words"])
    return sorted(lines, key=lambda line: (line["top"], line["x0"]))


def line_option_markers(line: dict) -> list[dict]:
    markers: list[dict] = []
    words = line["words"]
    for index, word in enumerate(words):
        if not re.match(r"^[1-4]\.$", word["text"]):
            continue

        previous = words[index - 1] if index else None
        gap = word["x0"] - previous["x1"] if previous else 999
        if previous is None or gap > 18:
            markers.append(
                {
                    "index": index,
                    "option": int(word["text"][0]),
                    "top": line["top"],
                    "bottom": line["bottom"],
                    "x0": word["x0"],
                }
            )
    return markers


def extract_plain_questions(pdf: pdfplumber.PDF) -> dict[int, dict]:
    parts: list[str] = []
    for page in pdf.pages:
        text = page.extract_text(layout=False) or ""
        parts.append(text)
    text = "\n".join(parts)

    matches = list(QUESTION_RE.finditer(text))
    questions: dict[int, dict] = {}

    for idx, match in enumerate(matches):
        number = normalize_question_number(match.group(1))
        if not 1 <= number <= 600:
            continue

        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        block = text[match.end() : end]
        lines = []
        for raw in block.splitlines():
            line = raw.strip()
            if not line or line.isdigit() or line.upper().startswith("CHƯƠNG"):
                continue
            lines.append(line)

        prompt_parts: list[str] = []
        options: dict[int, list[str]] = defaultdict(list)
        current_option: int | None = None

        for line in lines:
            marker_matches = list(OPTION_MARKER_RE.finditer(line))
            if not marker_matches:
                if current_option is None:
                    prompt_parts.append(line)
                else:
                    options[current_option].append(line)
                continue

            first_marker = marker_matches[0]
            before = line[: first_marker.start()].strip()
            if before and current_option is None:
                prompt_parts.append(before)

            for marker_index, marker in enumerate(marker_matches):
                option_number = int(marker.group(2))
                start = marker.end()
                stop = (
                    marker_matches[marker_index + 1].start()
                    if marker_index + 1 < len(marker_matches)
                    else len(line)
                )
                segment = line[start:stop].strip()
                if segment:
                    options[option_number].append(segment)
                current_option = option_number

        questions[number] = {
            "id": number,
            "prompt": clean_text(" ".join(prompt_parts)),
            "options": [
                {"id": key, "text": clean_text(" ".join(options[key]))}
                for key in sorted(options)
                if options[key]
            ],
            "chapter": chapter_for(number),
            "images": [],
        }

    return questions


def question_starts(lines_by_page: list[list[dict]]) -> list[tuple[int, float, int]]:
    starts: list[tuple[int, float, int]] = []
    for page_index, lines in enumerate(lines_by_page):
        for line in lines:
            match = QUESTION_RE.search(line["text"])
            if match:
                number = normalize_question_number(match.group(1))
                if 1 <= number <= 600:
                    starts.append((page_index, line["top"], number))
    return starts


def owner_question(starts: list[tuple[int, float, int]], page_index: int, top: float) -> int | None:
    owner: int | None = None
    for q_page, q_top, q_number in starts:
        if (q_page, q_top) <= (page_index, top):
            owner = q_number
        else:
            break
    return owner


def option_starts_for_page(
    lines_by_page: list[list[dict]],
    starts: list[tuple[int, float, int]],
) -> dict[int, list[dict]]:
    by_page: dict[int, list[dict]] = defaultdict(list)

    for page_index, lines in enumerate(lines_by_page):
        for line in lines:
            q_number = owner_question(starts, page_index, line["top"])
            if not q_number:
                continue
            for marker in line_option_markers(line):
                by_page[page_index].append(
                    {
                        "question": q_number,
                        "option": marker["option"],
                        "top": marker["top"],
                        "bottom": marker["bottom"],
                        "x0": marker["x0"],
                    }
                )
    return by_page


def extract_layout_options(
    lines_by_page: list[list[dict]],
    starts: list[tuple[int, float, int]],
) -> dict[int, dict[int, str]]:
    options: dict[int, dict[int, list[str]]] = defaultdict(lambda: defaultdict(list))
    active_by_question: dict[int, int | None] = defaultdict(lambda: None)

    for page_index, lines in enumerate(lines_by_page):
        for line in lines:
            text = line["text"].strip()
            if not text or text.isdigit() or text.upper().startswith("CHƯƠNG"):
                continue

            q_number = owner_question(starts, page_index, line["top"])
            if not q_number:
                continue

            if QUESTION_RE.search(text):
                active_by_question[q_number] = None

            markers = line_option_markers(line)
            if markers:
                words = line["words"]
                for marker_index, marker in enumerate(markers):
                    start = marker["index"] + 1
                    stop = markers[marker_index + 1]["index"] if marker_index + 1 < len(markers) else len(words)
                    segment = " ".join(word["text"] for word in words[start:stop])
                    if segment:
                        options[q_number][marker["option"]].append(segment)
                    active_by_question[q_number] = marker["option"]
                continue

            active = active_by_question[q_number]
            if active and not QUESTION_RE.search(text):
                options[q_number][active].append(text)

    return {
        q_number: {
            option: clean_text(" ".join(parts))
            for option, parts in sorted(option_map.items())
            if parts
        }
        for q_number, option_map in options.items()
    }


def detect_answers(
    pdf: pdfplumber.PDF,
    starts: list[tuple[int, float, int]],
    option_starts: dict[int, list[dict]],
) -> dict[int, int]:
    votes: dict[int, Counter] = defaultdict(Counter)

    for page_index, page in enumerate(pdf.pages):
        thin_rects = []
        for rect in page.rects:
            width = abs(rect["x1"] - rect["x0"])
            height = abs(rect["y1"] - rect["y0"])
            if width > 4 and height < 3:
                thin_rects.append(rect)

        for rect in thin_rects:
            q_number = owner_question(starts, page_index, rect["top"])
            if not q_number:
                continue

            candidates = [
                marker
                for marker in option_starts.get(page_index, [])
                if marker["question"] == q_number and marker["top"] <= rect["top"] + 4
            ]
            if not candidates:
                continue

            latest_top = max(marker["top"] for marker in candidates)
            latest = [marker for marker in candidates if abs(marker["top"] - latest_top) <= 3]
            left_of_rect = [marker for marker in latest if marker["x0"] <= rect["x0"] + 6]
            chosen = max(left_of_rect or latest, key=lambda marker: marker["x0"])
            votes[q_number][chosen["option"]] += 1

    return {
        number: counter.most_common(1)[0][0]
        for number, counter in votes.items()
        if counter
    }


def image_owners(pdf: pdfplumber.PDF, starts: list[tuple[int, float, int]]) -> dict[int, list[tuple[int, dict]]]:
    owners: dict[int, list[tuple[int, dict]]] = defaultdict(list)
    for page_index, page in enumerate(pdf.pages):
        for image in page.images:
            q_number = owner_question(starts, page_index, image["top"])
            if q_number:
                owners[q_number].append((page_index, image))
    return owners


def text_crop_limits(
    q_number: int,
    page_index: int,
    image: dict,
    lines_by_page: list[list[dict]],
    starts: list[tuple[int, float, int]],
) -> tuple[float, float]:
    top_limit = 0.0
    bottom_limit = 10_000.0

    for line in lines_by_page[page_index]:
        if owner_question(starts, page_index, line["top"]) != q_number:
            continue

        if line["bottom"] <= image["top"]:
            top_limit = max(top_limit, line["bottom"] + 2)
        elif line["top"] >= image["bottom"]:
            bottom_limit = min(bottom_limit, line["top"] - 2)

    return top_limit, bottom_limit


def render_question_images(
    owners: dict[int, list[tuple[int, dict]]],
    lines_by_page: list[list[dict]],
    starts: list[tuple[int, float, int]],
) -> dict[int, list[str]]:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    for old in IMAGE_DIR.glob("*"):
        old.unlink()

    pdf_doc = pdfium.PdfDocument(str(PDF_PATH))
    rendered_pages: dict[int, object] = {}
    paths: dict[int, list[str]] = defaultdict(list)
    scale = 2.5

    for q_number, images in owners.items():
        for image_index, (page_index, image) in enumerate(images, start=1):
            if page_index not in rendered_pages:
                page = pdf_doc[page_index]
                rendered_pages[page_index] = page.render(scale=scale).to_pil()
            pil_image = rendered_pages[page_index]

            margin = 8
            top_limit, bottom_limit = text_crop_limits(q_number, page_index, image, lines_by_page, starts)
            left = max(0, int((image["x0"] - margin) * scale))
            top_pt = max(image["top"] - margin, top_limit)
            bottom_pt = min(image["bottom"] + margin, bottom_limit)
            if bottom_pt <= top_pt:
                top_pt = image["top"]
                bottom_pt = image["bottom"]

            top = max(0, int(top_pt * scale))
            right = min(pil_image.width, int((image["x1"] + margin) * scale))
            bottom = min(pil_image.height, int(bottom_pt * scale))
            crop = pil_image.crop((left, top, right, bottom))

            filename = f"q{q_number:03d}-{image_index}.webp"
            crop.save(IMAGE_DIR / filename, "WEBP", quality=88)
            paths[q_number].append(f"/question-images/{filename}")

    return paths


def main() -> None:
    with pdfplumber.open(str(PDF_PATH)) as pdf:
        lines_by_page = [
            group_lines(page.extract_words(x_tolerance=1, y_tolerance=3))
            for page in pdf.pages
        ]
        starts = question_starts(lines_by_page)
        starts.sort(key=lambda item: (item[0], item[1]))

        questions = extract_plain_questions(pdf)
        layout_options = extract_layout_options(lines_by_page, starts)
        answers = detect_answers(pdf, starts, option_starts_for_page(lines_by_page, starts))
        images = render_question_images(image_owners(pdf, starts), lines_by_page, starts)

    missing = []
    for number in range(1, 601):
        question = questions.get(number)
        if not question:
            missing.append(number)
            continue
        if number in layout_options:
            question["options"] = [
                {"id": key, "text": value}
                for key, value in sorted(layout_options[number].items())
            ]
        question["answer"] = answers.get(number)
        question["images"] = images.get(number, [])

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(
        json.dumps([questions[number] for number in sorted(questions)], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    answer_count = sum(1 for question in questions.values() if question.get("answer"))
    image_count = sum(len(question.get("images", [])) for question in questions.values())
    print(f"pdf={PDF_PATH.name}")
    print(f"questions={len(questions)} answers={answer_count} images={image_count}")
    if missing:
        print("missing=" + ",".join(str(number) for number in missing))
    no_answer = [number for number, question in sorted(questions.items()) if not question.get("answer")]
    if no_answer:
        print("no_answer=" + ",".join(str(number) for number in no_answer[:80]))


if __name__ == "__main__":
    main()
