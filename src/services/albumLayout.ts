/** Partition consecutive image/GIF runs without reordering attachments.
 * Other media occupy full rows so controls and filenames remain usable. */
export function albumRows(kinds: readonly string[]): number[][] {
  const rows: number[][] = [];
  for (let i=0;i<kinds.length;) {
    if (!['image','gif'].includes(kinds[i])) { rows.push([i++]); continue; }
    let end=i;
    while(end<kinds.length && ['image','gif'].includes(kinds[end])) end++;
    while(i<end) {
      const remaining=end-i;
      const size=remaining===5||remaining===2||remaining===4?2:remaining>=3?3:1;
      rows.push(Array.from({length:size},(_,offset)=>i+offset));
      i+=size;
    }
  }
  return rows;
}
