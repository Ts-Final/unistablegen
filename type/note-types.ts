/*
* Here We rule:
* Originally in the game, there's
* - note
* - hazard
* - chip
* - flick
* - timing
* - lock (unused in demo)
*
* **And we separate note to**:
* - note, for note
* - hold, for ln
* - wide, for wide
* - wide ln, idk but it might be there
*
* For most,
* time -> ms/float
* x_pos -> 0 - 100 (90px - 310px)
* */
export namespace INotes {
  export type note = {
    time: number;
    // normal, break, ex-tap WTF
    type: 0 | 1 | 2;
    x_pos: number
  }
  export type hold = {
    time: number
    x_pos: number
    // time/ms, end_x, ease
    segment: [number, number, number][]
  }
  export type hazard = {
    time: number
    end: number
    // left start
    x1: number
    // right start
    x2: number
    // left end
    y1: number
    // right end
    y2: number
    // left ease
    e1: number
    // right ease
    e2: number
  }
  export type chip = {
    time: number
    x_pos: number
  }
  export type flick = {
    time: number
    x_pos: number
    to: 0 | 1
  }
  export type timing = {
    time: number
    bpm: number
    // 每小节多少拍
    num: number
    den: number
  }
  
  export type diff = {
    note: note[]
    hold: hold[]
    hazard: hazard[]
    chip: chip[]
    flick: flick[]
    timing: timing[]
    
    meta: meta
  }
  export type meta = {
    charter: string
    diff_name: string
    diff_num: number
    rating: number
  }
  
  export type song = {
    name: string
    composer: string
    perspective: number
    enemy: string
    bpm: string
    bpm_number: number
    sprite: number
    offset: number
    preview: [number, number]
  }
  
  export type final = {
    song: song
    diff: diff[]
    version: number
  }
}