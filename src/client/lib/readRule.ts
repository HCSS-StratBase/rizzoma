/**
 * The follow-the-green read rule, as SDS stated it on 4 Jul 2022 (Rizzoma@HCSS):
 *   "when you 'follow the green' (i.e. click the 'next' button), you will automatically ungreen that blip, but when you
 *    just look at green blips and open them (without clicking in them or changing anything), it will remain green."
 *
 * So a blip turns read when (a) Next lands on it, (b) the reader clicks in it, or (c) the reader edits it. Merely
 * unfolding a [+] row or opening an inline [+] marker does NOT mark it read. The topic's own root blip is shown the
 * moment the topic opens and is the one exception.
 * (PR 114 had made an open inline child count as read; that contradicted this rule and is reverted.)
 */
export function shouldMarkReadOnRender(args: { isRoot: boolean; isRead: boolean }): boolean {
  return args.isRoot && !args.isRead;
}
