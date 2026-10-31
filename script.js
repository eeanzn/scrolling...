// ===== 설정 =====
const SEARCH = "https://www.google.com/search?q=";
const MIN = 400;    // 클릭될 때까지 최소 스크롤 거리(px)
const RANGE = 800;  // 여기에 랜덤으로 더해지는 폭(px) → 400~1200px

// ===== 상태 =====
let lastY = window.scrollY;
let traveled = 0;
let threshold = randomThreshold();
let pointerX = window.innerWidth / 2;
let pointerY = window.innerHeight / 2;

function randomThreshold() {
  return MIN + Math.random() * RANGE;
}

// ===== 1. 커서 위치 기억 + 단어 위에 있으면 링크처럼 보이게 =====
window.addEventListener("pointermove", (e) => {
  pointerX = e.clientX;
  pointerY = e.clientY;
  updateHover();
});
window.addEventListener("pointerdown", (e) => {
  pointerX = e.clientX;
  pointerY = e.clientY;
});

// ===== 2. 스크롤 거리 재기 → 기준 넘으면 커서 아래 단어로 이동 =====
window.addEventListener("scroll", () => {
  const y = window.scrollY;
  traveled += Math.abs(y - lastY);
  lastY = y;

  updateHover(); // 커서는 그대로인데 글이 흘러가니까, 밑줄도 따라 바뀌게

  if (traveled >= threshold && goAt(pointerX, pointerY)) {
    traveled = 0;
    threshold = randomThreshold();
  }
});

// ===== 3. 직접 클릭해도 모든 단어가 링크처럼 =====
document.addEventListener("click", (e) => {
  if (e.target.closest("a")) return;            // 진짜 <a>는 브라우저가 알아서
  if (window.getSelection().toString()) return; // 드래그로 글 선택 중이면 무시
  goAt(e.clientX, e.clientY);
});

// ===== 4. 좌표 → 직접 단 링크 or 단어 검색 =====
function goAt(x, y) {
  const range = wordRangeAt(x, y);
  if (!range) return false;

  const link = range.startContainer.parentElement.closest("a");
  if (link) {
    link.click();
    return true;
  }

  const word = range.toString().replace(/[^\p{L}\p{N}]/gu, ""); // 문장부호 빼고 검색
  if (!word) return false;
  location.href = SEARCH + encodeURIComponent(word);
  return true;
}

// ===== 5. 좌표에 있는 단어 하나를 Range(텍스트 구간)로 돌려주기 =====
function wordRangeAt(x, y) {
  const caret = caretAt(x, y);
  if (!caret) return null;

  const text = caret.node.textContent;
  let start = caret.offset;
  let end = caret.offset;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;      // 왼쪽 공백까지
  while (end < text.length && !/\s/.test(text[end])) end++;       // 오른쪽 공백까지
  if (start === end) return null;

  const range = document.createRange();
  range.setStart(caret.node, start);
  range.setEnd(caret.node, end);

  // 커서가 진짜 그 단어 위에 있는지 확인 (줄 끝 빈 공간, 여백 클릭 제외)
  const onWord = [...range.getClientRects()].some(
    (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  );
  return onWord ? range : null;
}

// 좌표의 글자 위치 찾기 (옛 Safari용 대체 포함)
function caretAt(x, y) {
  let node, offset;
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos) return null;
    node = pos.offsetNode;
    offset = pos.offset;
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y);
    if (!range) return null;
    node = range.startContainer;
    offset = range.startOffset;
  } else {
    return null;
  }

  if (node.nodeType !== Node.TEXT_NODE) return null;
  if (!node.parentElement.closest("#contents")) return null; // 본문 밖은 무시
  return { node, offset };
}

// ===== 6. 마우스 올린 단어에 밑줄 + 손가락 커서 =====
function updateHover() {
  const range = wordRangeAt(pointerX, pointerY);
  document.body.style.cursor = range ? "pointer" : "";

  if (!(window.CSS && CSS.highlights)) return; // 지원 안 하는 브라우저는 커서만
  if (range) CSS.highlights.set("word", new Highlight(range));
  else CSS.highlights.delete("word");
}
