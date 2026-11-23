// Kani's book covers: small cute covers drawn from plain SVG shapes (no image files), one emblem per title,
// tinted by the kind of book so the colour hints at the shelf without giving the answer away in words.
import type { KaniShelf } from './kani-game';

const TINT: Record<KaniShelf, { cover: string; band: string }> = {
  story: { cover: '#f7bfd2', band: '#d9789d' },
  cook: { cover: '#f8cf85', band: '#d98d2b' },
  plant: { cover: '#b5e09a', band: '#5f9f45' },
};
const INK = '#5a3f22';
/** Emblems on a 40 x 56 cover (drawn in the area above the title strip). */
const EMBLEM: Record<string, string> = {
  '토끼와 거북이': `<ellipse cx="15" cy="13" rx="3.2" ry="8" fill="#fff"/><ellipse cx="25" cy="13" rx="3.2" ry="8" fill="#fff"/><circle cx="20" cy="27" r="9" fill="#fff"/><circle cx="17" cy="26" r="1.3" fill="${INK}"/><circle cx="23" cy="26" r="1.3" fill="${INK}"/>`,
  '달빛 공주 이야기': `<path d="M26 8a13 13 0 1 0 4 22 10 10 0 1 1-4-22z" fill="#fff4b8"/><circle cx="29" cy="14" r="1.6" fill="#fff"/>`,
  '용감한 작은 별': `<path d="M20 6l4.6 10 10.4 1-7.8 7 2.4 10.4L20 29l-9.6 5.4 2.4-10.4-7.8-7 10.4-1z" fill="#ffe27a" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>`,
  '숲속 친구들의 모험': `<path d="M20 5l10 14H10zM20 15l12 16H8z" fill="#7cc06a"/><rect x="18" y="31" width="4" height="7" fill="#9a6b3b"/>`,
  '감자 수프 만들기': `<path d="M6 22h28a14 12 0 0 1-28 0z" fill="#fff"/><path d="M14 7q-3 4 0 8M21 5q-3 4 0 8M28 7q-3 4 0 8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
  '따끈한 라멘 레시피': `<path d="M6 22h28a14 12 0 0 1-28 0z" fill="#fff"/><path d="M11 22q4-6 8 0t8 0" fill="none" stroke="#e9b84a" stroke-width="2.2"/><circle cx="26" cy="21" r="3.4" fill="#fff8e8" stroke="#e9a13a" stroke-width="1.2"/>`,
  '맛있는 팬케이크': `<ellipse cx="20" cy="31" rx="13" ry="4.5" fill="#e8a959"/><ellipse cx="20" cy="25" rx="13" ry="4.5" fill="#f4c27a"/><ellipse cx="20" cy="19" rx="13" ry="4.5" fill="#e8a959"/><rect x="16" y="11" width="8" height="5" rx="1.5" fill="#fff0a8"/>`,
  '오늘의 도시락': `<rect x="6" y="14" width="28" height="22" rx="4" fill="#fff"/><circle cx="14" cy="25" r="4" fill="#f08a6a"/><circle cx="24" cy="22" r="3" fill="#8fcf6f"/><circle cx="27" cy="30" r="3" fill="#ffd45e"/>`,
  '꽃 기르기 첫걸음': `<g fill="#ffb3c7"><circle cx="20" cy="12" r="5"/><circle cx="27" cy="18" r="5"/><circle cx="13" cy="18" r="5"/><circle cx="23" cy="25" r="5"/><circle cx="17" cy="25" r="5"/></g><circle cx="20" cy="19" r="4" fill="#ffd45e"/>`,
  '튼튼한 풀과 잡초': `<path d="M20 38V14M20 38Q12 26 10 12M20 38Q28 26 31 14" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>`,
  '작은 화분 가꾸기': `<path d="M10 24h20l-3 14H13z" fill="#d98d5a"/><path d="M20 24V14M20 18q-8-1-9-8 8 0 9 8zM20 16q7-1 9-7-8-1-9 7z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`,
  '들꽃 도감': `<g fill="#fff"><circle cx="20" cy="11" r="4"/><circle cx="27" cy="17" r="4"/><circle cx="13" cy="17" r="4"/><circle cx="25" cy="25" r="4"/><circle cx="15" cy="25" r="4"/></g><circle cx="20" cy="18" r="3.4" fill="#f2b94a"/><path d="M20 30v9" stroke="#fff" stroke-width="2.4"/>`,
};
/** Cover markup for one book (an inline SVG; decorative, the title is shown as text beside it). */
export function kaniCoverSvg(shelf: KaniShelf, title: string): string {
  const t = TINT[shelf];
  return `<svg class="kani-cover-art" viewBox="0 0 40 56" aria-hidden="true"><rect x="1.5" y="1.5" width="37" height="53" rx="4" fill="${t.cover}" stroke="${INK}" stroke-width="2"/><rect x="1.5" y="1.5" width="6" height="53" rx="3" fill="${t.band}"/><g transform="translate(3 4) scale(.92)">${EMBLEM[title] ?? ''}</g></svg>`;
}
