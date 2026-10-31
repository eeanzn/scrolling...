// ===== 설정 =====
const SEARCH = "https://www.google.com/search?q=";
const MIN = 400;    // 클릭될 때까지 최소 스크롤 거리(px)
const RANGE = 800;  // 여기에 랜덤으로 더해지는 폭(px) → 400~1200px
const SAVE_KEY = "scrolling:y"; // 뒤로 돌아왔을 때 복원할 스크롤 위치

// ===== 상태 =====
// 핵심: 화면 좌표(clientX/Y)는 스크롤하면 다른 글자를 가리키게 되니까,
// 터치는 '닿은 단어 자체(Range)'를 저장해둔다. Range는 글 속 위치라서 스크롤해도 같은 단어 그대로.
let lastY = window.scrollY;
let traveled = 0;
let threshold = randomThreshold();
let pointerX = window.innerWidth / 2;
let pointerY = window.innerHeight / 2;
let pointerType = "mouse"; // 마지막 입력이 mouse인지 touch/pen인지
let target = null;         // 터치로 드래그 시작할 때 닿은 단어
let armed = false;         // 사용자가 직접 스크롤했을 때만 true (브라우저의 복원 스크롤은 무시)
let leaving = false;       // 이미 이동을 시작했으면 true (관성 스크롤로 또 이동하는 것 방지)

function randomThreshold() {
  return MIN + Math.random() * RANGE;
}

// ===== 1. 입력 기억 =====
window.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return; // 터치는 드래그 중 좌표가 의미 없음
  pointerType = "mouse";
  pointerX = e.clientX;
  pointerY = e.clientY;
  updateHover();
});

window.addEventListener("pointerdown", (e) => {
  pointerType = e.pointerType;
  pointerX = e.clientX;
  pointerY = e.clientY;
  armed = true;
  // 터치·펜: 손가락이 처음 닿은 단어를 잡아둔다 → 나중에 이 단어가 클릭됨
  // (손가락은 부정확하니 줄 사이 틈을 눌러도 가장 가까운 단어로)
  target = e.pointerType === "mouse" ? null : wordRangeAt(e.clientX, e.clientY, true);
  updateHover();
});

// 휠·트랙패드·키보드 스크롤도 '사용자가 직접 한 스크롤'로 인정
// (마우스는 지금 커서 밑에 밑줄 쳐진 단어가 클릭되니까 target은 비움)
window.addEventListener("wheel", () => { armed = true; target = null; }, { passive: true });
window.addEventListener("keydown", () => { armed = true; target = null; });

// ===== 2. 스크롤 거리 재기 → 기준 넘으면 단어로 이동 =====
window.addEventListener("scroll", () => {
  const y = window.scrollY;
  const delta = Math.abs(y - lastY);
  lastY = y;

  updateHover(); // 커서는 그대로인데 글이 흘러가니까, 밑줄도 따라 바뀌게

  if (!armed || leaving) return; // 복원 스크롤이나 이동 중 관성은 세지 않음
  traveled += delta;
  if (traveled < threshold) return;

  const range = target || wordRangeAt(pointerX, pointerY);
  if (goRange(range)) {
    traveled = 0;
    threshold = randomThreshold();
  }
});

// ===== 3. 직접 클릭해도 모든 단어가 링크처럼 =====
document.addEventListener("click", (e) => {
  if (e.target.closest("a")) return;            // 진짜 <a>는 브라우저가 알아서
  if (window.getSelection().toString()) return; // 드래그로 글 선택 중이면 무시
  goRange(wordRangeAt(e.clientX, e.clientY));
});

// ===== 4. 단어 → 직접 단 링크 or 단어 검색 =====
function goRange(range) {
  if (!range || leaving) return false;

  const link = range.startContainer.parentElement.closest("a");
  let word = "";
  if (!link) {
    word = range.toString().replace(/[^\p{L}\p{N}]/gu, ""); // 문장부호 빼고 검색
    if (!word) return false;
  }

  leaving = true;
  saveScroll();
  if (link) {
    link.click();
  } else {
    location.href = SEARCH + encodeURIComponent(word);
  }
  // mailto처럼 페이지를 안 떠나는 링크면 잠금 풀기 (진짜로 떠났으면 의미 없음)
  setTimeout(() => { leaving = false; }, 1000);
  return true;
}

// ===== 5. 좌표에 있는 단어 하나를 Range(텍스트 구간)로 돌려주기 =====
// loose = true면 '정확히 단어 위'가 아니어도 가장 가까운 단어를 돌려줌 (터치용)
function wordRangeAt(x, y, loose = false) {
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
  return onWord || loose ? range : null;
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

// ===== 6. 밑줄 + 손가락 커서 =====
// 마우스: 커서 밑 단어 / 터치: 처음 닿은 단어(스크롤해도 그 단어를 따라감)
function updateHover() {
  const range = pointerType === "mouse" ? wordRangeAt(pointerX, pointerY) : target;
  document.body.style.cursor = pointerType === "mouse" && range ? "pointer" : "";

  if (!(window.CSS && CSS.highlights)) return; // 지원 안 하는 브라우저는 커서만
  if (range) CSS.highlights.set("word", new Highlight(range));
  else CSS.highlights.delete("word");
}

// ===== 7. 뒤로가기 처리 =====
// 스크롤 위치는 직접 저장/복원 (웹폰트가 늦게 로드돼도 폰트 적용 후에 제자리로)
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

function saveScroll() {
  try { sessionStorage.setItem(SAVE_KEY, String(window.scrollY)); } catch (e) {}
}
// 진짜 <a> 링크로 떠날 때도 위치 저장
window.addEventListener("pagehide", saveScroll);

// 뒤로가기·새로고침으로 다시 열렸을 때만 복원 (처음 들어온 경우는 맨 위에서 시작)
(function restoreScroll() {
  const nav = performance.getEntriesByType("navigation")[0];
  if (!nav || (nav.type !== "back_forward" && nav.type !== "reload")) return;
  let saved = null;
  try { saved = sessionStorage.getItem(SAVE_KEY); } catch (e) {}
  if (saved === null) return;

  const ready = document.fonts ? document.fonts.ready : Promise.resolve();
  ready.then(() => {
    window.scrollTo(0, Number(saved));
    lastY = window.scrollY; // 복원으로 생긴 이동은 거리에 안 셈
  });
})();

// 페이지가 (bfcache로) 되살아날 때마다 상태 초기화 → 돌아오자마자 또 검색되는 것 방지
window.addEventListener("pageshow", () => {
  lastY = window.scrollY;
  traveled = 0;
  threshold = randomThreshold();
  armed = false;
  leaving = false;
  target = null;
  updateHover();
});
