/* AUTO-GENERATED equivalent (manually checked-in): lazy loaders for word buckets.
 *
 * Important: this avoids eagerly `require()`-ing all JSON buckets at module load time.
 * Each bucket is loaded only when needed.
 */
/* eslint-disable @typescript-eslint/no-var-requires */

export type WordEntryTuple = readonly [string, string, string[], string[]]; // [surface, reading, meanings, pos]

export const WORD_BUCKET_COUNT = 64 as const;

export const WORD_BUCKET_LOADERS: Record<string, () => readonly WordEntryTuple[]> = {
  '00': () => require('../../assets/dictionaries/words/bucket_00.json'),
  '01': () => require('../../assets/dictionaries/words/bucket_01.json'),
  '02': () => require('../../assets/dictionaries/words/bucket_02.json'),
  '03': () => require('../../assets/dictionaries/words/bucket_03.json'),
  '04': () => require('../../assets/dictionaries/words/bucket_04.json'),
  '05': () => require('../../assets/dictionaries/words/bucket_05.json'),
  '06': () => require('../../assets/dictionaries/words/bucket_06.json'),
  '07': () => require('../../assets/dictionaries/words/bucket_07.json'),
  '08': () => require('../../assets/dictionaries/words/bucket_08.json'),
  '09': () => require('../../assets/dictionaries/words/bucket_09.json'),
  '0a': () => require('../../assets/dictionaries/words/bucket_0a.json'),
  '0b': () => require('../../assets/dictionaries/words/bucket_0b.json'),
  '0c': () => require('../../assets/dictionaries/words/bucket_0c.json'),
  '0d': () => require('../../assets/dictionaries/words/bucket_0d.json'),
  '0e': () => require('../../assets/dictionaries/words/bucket_0e.json'),
  '0f': () => require('../../assets/dictionaries/words/bucket_0f.json'),
  '10': () => require('../../assets/dictionaries/words/bucket_10.json'),
  '11': () => require('../../assets/dictionaries/words/bucket_11.json'),
  '12': () => require('../../assets/dictionaries/words/bucket_12.json'),
  '13': () => require('../../assets/dictionaries/words/bucket_13.json'),
  '14': () => require('../../assets/dictionaries/words/bucket_14.json'),
  '15': () => require('../../assets/dictionaries/words/bucket_15.json'),
  '16': () => require('../../assets/dictionaries/words/bucket_16.json'),
  '17': () => require('../../assets/dictionaries/words/bucket_17.json'),
  '18': () => require('../../assets/dictionaries/words/bucket_18.json'),
  '19': () => require('../../assets/dictionaries/words/bucket_19.json'),
  '1a': () => require('../../assets/dictionaries/words/bucket_1a.json'),
  '1b': () => require('../../assets/dictionaries/words/bucket_1b.json'),
  '1c': () => require('../../assets/dictionaries/words/bucket_1c.json'),
  '1d': () => require('../../assets/dictionaries/words/bucket_1d.json'),
  '1e': () => require('../../assets/dictionaries/words/bucket_1e.json'),
  '1f': () => require('../../assets/dictionaries/words/bucket_1f.json'),
  '20': () => require('../../assets/dictionaries/words/bucket_20.json'),
  '21': () => require('../../assets/dictionaries/words/bucket_21.json'),
  '22': () => require('../../assets/dictionaries/words/bucket_22.json'),
  '23': () => require('../../assets/dictionaries/words/bucket_23.json'),
  '24': () => require('../../assets/dictionaries/words/bucket_24.json'),
  '25': () => require('../../assets/dictionaries/words/bucket_25.json'),
  '26': () => require('../../assets/dictionaries/words/bucket_26.json'),
  '27': () => require('../../assets/dictionaries/words/bucket_27.json'),
  '28': () => require('../../assets/dictionaries/words/bucket_28.json'),
  '29': () => require('../../assets/dictionaries/words/bucket_29.json'),
  '2a': () => require('../../assets/dictionaries/words/bucket_2a.json'),
  '2b': () => require('../../assets/dictionaries/words/bucket_2b.json'),
  '2c': () => require('../../assets/dictionaries/words/bucket_2c.json'),
  '2d': () => require('../../assets/dictionaries/words/bucket_2d.json'),
  '2e': () => require('../../assets/dictionaries/words/bucket_2e.json'),
  '2f': () => require('../../assets/dictionaries/words/bucket_2f.json'),
  '30': () => require('../../assets/dictionaries/words/bucket_30.json'),
  '31': () => require('../../assets/dictionaries/words/bucket_31.json'),
  '32': () => require('../../assets/dictionaries/words/bucket_32.json'),
  '33': () => require('../../assets/dictionaries/words/bucket_33.json'),
  '34': () => require('../../assets/dictionaries/words/bucket_34.json'),
  '35': () => require('../../assets/dictionaries/words/bucket_35.json'),
  '36': () => require('../../assets/dictionaries/words/bucket_36.json'),
  '37': () => require('../../assets/dictionaries/words/bucket_37.json'),
  '38': () => require('../../assets/dictionaries/words/bucket_38.json'),
  '39': () => require('../../assets/dictionaries/words/bucket_39.json'),
  '3a': () => require('../../assets/dictionaries/words/bucket_3a.json'),
  '3b': () => require('../../assets/dictionaries/words/bucket_3b.json'),
  '3c': () => require('../../assets/dictionaries/words/bucket_3c.json'),
  '3d': () => require('../../assets/dictionaries/words/bucket_3d.json'),
  '3e': () => require('../../assets/dictionaries/words/bucket_3e.json'),
  '3f': () => require('../../assets/dictionaries/words/bucket_3f.json'),
} as const;


