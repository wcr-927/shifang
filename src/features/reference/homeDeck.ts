// The cursor can move back without changing the rest of this shuffled round.
type Deck = { order: number[]; cursor: number; previous: number[] };
const key = 'shifang.home.shuffle.v1';
const day = () => new Date().toLocaleDateString('en-CA');

function shuffle(size: number, last?: number): number[] {
  const order = Array.from({length:size}, (_, i) => i);
  for (let i=size-1; i>0; i--) {
    const j=Math.floor(Math.random()*(i+1));
    [order[i],order[j]]=[order[j],order[i]];
  }
  if (size>1 && order[0]===last) {
    const j=1+Math.floor(Math.random()*(size-1));
    [order[0],order[j]]=[order[j],order[0]];
  }
  return order;
}

export function moveDeck(deck: Deck, back: boolean): Deck {
  const cursor=deck.cursor+(back?-1:1);
  if (cursor>=deck.order.length) return {order:shuffle(deck.order.length,deck.order.at(-1)),cursor:0,previous:deck.order};
  return {...deck,cursor:Math.max(-deck.previous.length,cursor)};
}
export const currentPoem = (d:Deck) => d.cursor<0 ? d.previous[d.previous.length+d.cursor] : d.order[d.cursor];

export function saveDeck(deck:Deck) {
  try { localStorage.setItem(key,JSON.stringify({...deck,day:day()})); } catch { /* Optional persistence. */ }
  return deck;
}
export function loadDeck(size:number):Deck {
  try {
    const d=JSON.parse(localStorage.getItem(key)??'null');
    const round=(x:unknown)=>Array.isArray(x)&&x.length===size&&new Set(x).size===size&&x.every(i=>Number.isInteger(i)&&i>=0&&i<size);
    if(d && round(d.order) && Array.isArray(d.previous) && (!d.previous.length||round(d.previous)) && Number.isInteger(d.cursor) && d.cursor>=-d.previous.length && d.cursor<size)
      return saveDeck(d.day===day()?d:moveDeck(d,false));
  } catch { /* Start a fresh round if storage is unavailable or stale. */ }
  return saveDeck({order:shuffle(size),cursor:0,previous:[]});
}
