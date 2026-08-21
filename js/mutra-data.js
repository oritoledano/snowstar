// Mutra — full music licensing catalog, synced against the master Dropbox
// folders (MUSIC/SNOWSTAR MUSIC CATALOG + MUSIC/NEW) by audio fingerprint:
// duplicates collapsed, titles follow the source filenames, packages follow
// the folder structure, newer versions (VER 2/remasters) replace older audio.
// Audio + covers self-hosted on Cloudflare R2 (free tier, zero egress).
const MUTRA = {
 "tracks": [
  {
   "title": "123 CLAP",
   "slug": "123-clap",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 156,
   "audio": "https://cdn.snowstar.company/audio/5835996761423872.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/123-clap.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 130,
   "vocal": "Vocals",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "25 BOOMS & A BANG",
   "slug": "25-booms-a-bang",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 84,
   "audio": "https://cdn.snowstar.company/audio/5356950688628736.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/25-booms-a-bang.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 92,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "80'S PARODY PLAYBACK",
   "slug": "s-parody-playback",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 65,
   "audio": "https://cdn.snowstar.company/audio/4746450078531584.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/s-parody-playback.jpg",
   "moods": [
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Piano",
    "Vocals"
   ],
   "bpm": 152,
   "vocal": "Vocals",
   "key": "G",
   "scale": "major"
  },
  {
   "title": "9 SHUTTLE",
   "slug": "shuttle",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "House & Beyond"
   ],
   "duration": 464,
   "audio": "https://cdn.snowstar.company/audio/6413980090236928.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/shuttle.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 121,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "ACID JAZZ (CLOCK)",
   "slug": "acid-jazz-clock",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 96,
   "audio": "https://cdn.snowstar.company/audio/5159866450575360.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/acid-jazz-clock.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 140,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "ACID JAZZ (CLOCK) RHYTHM ONLY",
   "slug": "acid-jazz-clock-rhythm-only",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 96,
   "audio": "https://cdn.snowstar.company/audio-src/acid-jazz-clock-rhythm-only.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/acid-jazz-clock-rhythm-only.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 140,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "major"
  },
  {
   "title": "ACTION TENSION",
   "slug": "action-tension",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Rock"
   ],
   "packages": [],
   "duration": 110,
   "audio": "https://cdn.snowstar.company/audio/6734367101550592.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/action-tension.jpg",
   "moods": [
    "Dramatic",
    "Tense"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 100,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "ACTION TENSION - EPIC ENDING",
   "slug": "action-tension-epic-ending",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Rock"
   ],
   "packages": [],
   "duration": 110,
   "audio": "https://cdn.snowstar.company/audio/5449624875696128.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/action-tension-epic-ending.jpg",
   "moods": [
    "Dramatic",
    "Tense"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 100,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "ACTION TENSION DRUMS",
   "slug": "action-tension-drums",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Electronic"
   ],
   "packages": [],
   "duration": 110,
   "audio": "https://cdn.snowstar.company/audio-src/action-tension-drums.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/action-tension-drums.jpg",
   "moods": [
    "Dramatic",
    "Tense"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 100,
   "vocal": "Instrumental"
  },
  {
   "title": "ALL MY TIME",
   "slug": "all-my-time",
   "artist": "Ori Toledano",
   "genres": [
    "Funk & Soul",
    "Rock"
   ],
   "packages": [
    "Vintage"
   ],
   "duration": 248,
   "audio": "https://cdn.snowstar.company/audio/5678835938885632.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/all-my-time.jpg",
   "moods": [
    "Uplifting",
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 90,
   "vocal": "Vocals",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "ALTERNATIVE UPLIFTING (H2)",
   "slug": "alternative-uplifting-h2",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Classical"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 111,
   "audio": "https://cdn.snowstar.company/audio/5238518643163136.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/alternative-uplifting-h2.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano",
    "Synth"
   ],
   "bpm": 128,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "AMERICAN BOOTY",
   "slug": "american-booty",
   "artist": "Ori Toledano",
   "genres": [
    "World",
    "Ambient"
   ],
   "packages": [
    "Selected"
   ],
   "duration": 77,
   "audio": "https://cdn.snowstar.company/audio/5519993619873792.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/american-booty.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental"
   ],
   "bpm": 124,
   "vocal": "Instrumental",
   "key": "C#",
   "scale": "major"
  },
  {
   "title": "ANGELS CHOIR",
   "slug": "angels-choir",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 18,
   "audio": "https://cdn.snowstar.company/audio/5062596782718976.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/angels-choir.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 112,
   "vocal": "Vocals",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "ANIMALS (MA ES)",
   "slug": "aggressive-exit",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Dance"
   ],
   "packages": [],
   "duration": 84,
   "audio": "https://cdn.snowstar.company/audio/5661103117828096.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/aggressive-exit.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 116,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "ARCADIA",
   "slug": "arcadia",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 51,
   "audio": "https://cdn.snowstar.company/audio-extra/arcadia.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/arcadia.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 122,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "ARCTIC MONKEYS - R U MINE (ORI TOLEDANO REMIX)",
   "slug": "arctic-monkeys-r-u-mine-ori-toledano-remix",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 252,
   "audio": "https://cdn.snowstar.company/audio/5502914078441472.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/arctic-monkeys-r-u-mine-ori-toledano-remix.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 97,
   "vocal": "Vocals",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "BACKFLIPTOYS",
   "slug": "backfliptoys",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 233,
   "audio": "https://cdn.snowstar.company/audio/5243434770104320.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/backfliptoys.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 106,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "BAD ACID IN GOA",
   "slug": "bad-acid-in-goa",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 58,
   "audio": "https://cdn.snowstar.company/audio-src/bad-acid-in-goa.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/bad-acid-in-goa.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "BALLOON 6",
   "slug": "balloon-6",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 173,
   "audio": "https://cdn.snowstar.company/audio/5933922636529664.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/balloon-6.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 126,
   "vocal": "Vocals",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "BASEGROUND (BASS GUITAR)",
   "slug": "baseground-bass-guitar",
   "artist": "Ori Toledano",
   "genres": [
    "Funk & Soul",
    "Rock"
   ],
   "packages": [],
   "duration": 236,
   "audio": "https://cdn.snowstar.company/audio/5661243752841216.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/baseground-bass-guitar.jpg",
   "moods": [
    "Party",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 125,
   "vocal": "Vocals",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "BASEGROUND (BASS KEYS)",
   "slug": "baseground-bass-keys",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 236,
   "audio": "https://cdn.snowstar.company/audio/5098293799419904.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/baseground-bass-keys.jpg",
   "moods": [
    "Party",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 125,
   "vocal": "Vocals",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "BASEGROUND (ORIGINAL MIX)",
   "slug": "baseground-original-mix",
   "artist": "Ori Toledano",
   "genres": [
    "Indie",
    "Rock"
   ],
   "packages": [],
   "duration": 236,
   "audio": "https://cdn.snowstar.company/audio/6224193706262528.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/baseground-original-mix.jpg",
   "moods": [
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 125,
   "vocal": "Vocals",
   "key": "E",
   "scale": "major"
  },
  {
   "title": "BASEGROUND (PLAYBACK)",
   "slug": "baseground-playback",
   "artist": "Ori Toledano",
   "genres": [
    "Funk & Soul",
    "Rock"
   ],
   "packages": [],
   "duration": 236,
   "audio": "https://cdn.snowstar.company/audio/5370972683108352.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/baseground-playback.jpg",
   "moods": [
    "Party",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 125,
   "vocal": "Vocals",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "BASEGROUND (SHORT)",
   "slug": "baseground-short",
   "artist": "Ori Toledano",
   "genres": [
    "Indie",
    "Rock"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 38,
   "audio": "https://cdn.snowstar.company/audio/5913618782617600.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/baseground-short.jpg",
   "moods": [
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 125,
   "vocal": "Vocals",
   "key": "E",
   "scale": "major"
  },
  {
   "title": "BASSLIA",
   "slug": "basslia",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 130,
   "audio": "https://cdn.snowstar.company/audio/5969107008618496.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/basslia.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 90,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "major"
  },
  {
   "title": "BE WITH ME (INSTRUMENTAL)",
   "slug": "be-with-me-instrumental",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 240,
   "audio": "https://cdn.snowstar.company/audio/4961959793393664.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/be-with-me-instrumental.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 126,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "BEAUTY & FEMININE 10 SEC",
   "slug": "beauty-feminine-10-sec",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Pop"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 10,
   "audio": "https://cdn.snowstar.company/audio/5625546736140288.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/beauty-feminine-10-sec.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 116,
   "vocal": "Vocals",
   "key": "D",
   "scale": "major"
  },
  {
   "title": "BEAUTY & FEMININE 5 SEC",
   "slug": "beauty-feminine-5-sec",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Pop"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 5,
   "audio": "https://cdn.snowstar.company/audio/6188496689561600.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/beauty-feminine-5-sec.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 116,
   "vocal": "Vocals",
   "key": "D",
   "scale": "major"
  },
  {
   "title": "BETTER DAYS AHEAD",
   "slug": "better-days-ahead",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Rock"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 152,
   "audio": "https://cdn.snowstar.company/audio/6576037427150848.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/better-days-ahead.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 116,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "major"
  },
  {
   "title": "BEVERLY HILLS MAHARAJA",
   "slug": "beverly-hills-maharaja",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 163,
   "audio": "https://cdn.snowstar.company/audio/4750853560860672.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/beverly-hills-maharaja.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 110,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "BEVERLY HILLS MAHARAJA - MINIMAL EDIT",
   "slug": "beverly-hills-maharaja-minimal-edit",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 172,
   "audio": "https://cdn.snowstar.company/audio/5479986133729280.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/beverly-hills-maharaja-minimal-edit.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 110,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "BICYCLETTE",
   "slug": "bicyclette",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 191,
   "audio": "https://cdn.snowstar.company/audio/6382010736050176.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/bicyclette.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Synth",
    "Vocals"
   ],
   "bpm": 112,
   "vocal": "Vocals",
   "key": "C#",
   "scale": "minor"
  },
  {
   "title": "BICYCLETTE (INSTRUMENTAL)",
   "slug": "bicyclette-instrumental",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 191,
   "audio": "https://cdn.snowstar.company/audio/6446039840063488.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/bicyclette-instrumental.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 112,
   "vocal": "Instrumental",
   "key": "C#",
   "scale": "minor"
  },
  {
   "title": "BIG FAT FUNERAL",
   "slug": "big-fat-funeral",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [
    "Selected"
   ],
   "duration": 102,
   "audio": "https://cdn.snowstar.company/audio/6540340410449920.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/big-fat-funeral.jpg",
   "moods": [
    "Dramatic",
    "Dark",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 99,
   "vocal": "Instrumental"
  },
  {
   "title": "BIG FAT FUNERAL (SHORT EDIT)",
   "slug": "big-fat-funeral-3",
   "artist": "Ori Toledano",
   "genres": [
    "Classical",
    "Cinematic"
   ],
   "packages": [
    "Shilton Haztlalim"
   ],
   "duration": 79,
   "audio": "https://cdn.snowstar.company/audio/6467358069620736.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/big-fat-funeral-3.jpg",
   "moods": [
    "Dramatic",
    "Dark",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano",
    "Strings"
   ],
   "bpm": 99,
   "vocal": "Instrumental",
   "key": "Eb",
   "scale": "minor"
  },
  {
   "title": "BIG FAT FUNERAL - REMASTERED",
   "slug": "big-fat-funeral-remastered",
   "artist": "Ori Toledano",
   "genres": [
    "Classical",
    "Cinematic"
   ],
   "packages": [],
   "duration": 79,
   "audio": "https://cdn.snowstar.company/audio/6082943573295104.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/big-fat-funeral-remastered.jpg",
   "moods": [
    "Dramatic",
    "Dark",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano",
    "Strings"
   ],
   "bpm": 99,
   "vocal": "Instrumental",
   "key": "Eb",
   "scale": "minor"
  },
  {
   "title": "BINARY ROMANCE",
   "slug": "binary-romance",
   "artist": "Ori Toledano",
   "genres": [
    "Retro 8-Bit",
    "Electronic"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 89,
   "audio": "https://cdn.snowstar.company/audio-extra/binary-romance.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/binary-romance.jpg",
   "moods": [
    "Party",
    "Romantic"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 130,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "BITCHES",
   "slug": "bitches",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 241,
   "audio": "https://cdn.snowstar.company/audio/5173066025926656.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/bitches.jpg",
   "moods": [
    "Party",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 126,
   "vocal": "Vocals",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "BITTER SWEET MYSTERY THEME",
   "slug": "bitter-sweet-mystery-theme",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [
    "Shilton Haztlalim"
   ],
   "duration": 113,
   "audio": "https://cdn.snowstar.company/audio/5858804354777088.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/bitter-sweet-mystery-theme.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 100,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "BITTER SWEET MYSTERY THEME - EPIC ENDING",
   "slug": "bitter-sweet-mystery-theme-epic-ending",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [],
   "duration": 113,
   "audio": "https://cdn.snowstar.company/audio/5414440503607296.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/bitter-sweet-mystery-theme-epic-ending.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 100,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "BLONDE LIKE DISCO",
   "slug": "blonde-like-disco",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 335,
   "audio": "https://cdn.snowstar.company/audio/4632100869242880.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/blonde-like-disco.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 124,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "BOLERO HYPED FOLK WHISTLE",
   "slug": "bolero-hyped-folk-whistle",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 33,
   "audio": "https://cdn.snowstar.company/audio/4596916497154048.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/bolero-hyped-folk-whistle.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 107,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "BOSSA FUNK MUSIC",
   "slug": "bossa-funk-music",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 26,
   "audio": "https://cdn.snowstar.company/audio/6496872589950976.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/bossa-funk-music.jpg",
   "moods": [
    "Party",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 132,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "BRATS",
   "slug": "the-mid-rider",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 44,
   "audio": "https://cdn.snowstar.company/audio/5027925055242240.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-mid-rider.jpg",
   "moods": [
    "Party",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 140,
   "vocal": "Vocals",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "BRIGHT MEMORIES",
   "slug": "bright-memories",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [],
   "duration": 147,
   "audio": "https://cdn.snowstar.company/audio/5868482350546944.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/bright-memories.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental",
    "Piano"
   ],
   "bpm": 90,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "BROWNY",
   "slug": "browny",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 23,
   "audio": "https://cdn.snowstar.company/audio/4843207101775872.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/browny.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 124,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "BY YOU",
   "slug": "by-you",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Electronica"
   ],
   "duration": 273,
   "audio": "https://cdn.snowstar.company/audio/6593116968583168.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/by-you.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 135,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "C'EST POUR TOI",
   "slug": "c-est-pour-toi",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Dance"
   ],
   "packages": [
    "Electronica"
   ],
   "duration": 228,
   "audio": "https://cdn.snowstar.company/audio/4763529619963904.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/c-est-pour-toi.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "CAIRO BLACKOUT",
   "slug": "cairo-blackout",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Hip Hop"
   ],
   "packages": [],
   "duration": 234,
   "audio": "https://cdn.snowstar.company/audio/4814214310920192.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/cairo-blackout.jpg",
   "moods": [
    "Dark"
   ],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 86,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "CAN'T DENY IT",
   "slug": "can-t-deny-it",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "House & Beyond"
   ],
   "duration": 310,
   "audio": "https://cdn.snowstar.company/audio/5006605206683648.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/can-t-deny-it.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 124,
   "vocal": "Instrumental",
   "key": "Ab",
   "scale": "major"
  },
  {
   "title": "CAN'T STOP THE SUMMER FUN",
   "slug": "can-t-stop-the-summer-fun",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "House & Techno"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 116,
   "audio": "https://cdn.snowstar.company/audio/6369334676946944.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/can-t-stop-the-summer-fun.jpg",
   "moods": [
    "Party",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 112,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "CANNIBALS",
   "slug": "cannibals",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Electronic"
   ],
   "packages": [],
   "duration": 81,
   "audio": "https://cdn.snowstar.company/audio/6250581985329152.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/cannibals.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 116,
   "vocal": "Instrumental",
   "key": "F#",
   "scale": "major"
  },
  {
   "title": "CAPTAIN GALACTIC",
   "slug": "captain-galactic",
   "artist": "Ori Toledano",
   "genres": [
    "Metal"
   ],
   "packages": [],
   "duration": 18,
   "audio": "https://cdn.snowstar.company/audio-src/captain-galactic.m4a",
   "cover": "https://cdn.snowstar.company/covers-art-sm/captain-galactic.jpg",
   "moods": [
    "Dark",
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 135,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "CAPTAIN TURBO",
   "slug": "captain-turbo",
   "artist": "Ori Toledano",
   "genres": [
    "Metal",
    "Rock"
   ],
   "packages": [],
   "duration": 39,
   "audio": "https://cdn.snowstar.company/audio/5290370441150464.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/captain-turbo.jpg",
   "moods": [
    "Sad"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 136,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "CAPTURE",
   "slug": "capture",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 205,
   "audio": "https://cdn.snowstar.company/audio/6505156038361088.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/capture.jpg",
   "moods": [
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 88,
   "vocal": "Vocals",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "CASH FLOW",
   "slug": "cash-flow",
   "artist": "Ori Toledano",
   "genres": [
    "Hip Hop",
    "Trap"
   ],
   "packages": [],
   "duration": 114,
   "audio": "https://cdn.snowstar.company/audio/5670488116297728.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/cash-flow.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 123,
   "vocal": "Vocals",
   "key": "F",
   "scale": "major"
  },
  {
   "title": "CASINO GAZA",
   "slug": "casino-gaza",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "House & Techno"
   ],
   "packages": [],
   "duration": 49,
   "audio": "https://cdn.snowstar.company/audio/6435299938795520.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/casino-gaza.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 122,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "CASINO GAZA - MINIMAL",
   "slug": "casino-gaza-minimal",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 124,
   "audio": "https://cdn.snowstar.company/audio-src/casino-gaza-minimal.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/casino-gaza-minimal.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "CELEBRISHIT",
   "slug": "celebrishit",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 196,
   "audio": "https://cdn.snowstar.company/audio/5793185148174336.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/celebrishit.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "CHASING LIGHTS",
   "slug": "chasing-lights",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "Ambient"
   ],
   "packages": [],
   "duration": 38,
   "audio": "https://cdn.snowstar.company/audio/5853320394571776.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/chasing-lights.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental"
   ],
   "bpm": 96,
   "vocal": "Instrumental",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "CHASING NIGHTS",
   "slug": "chasing-nights",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Selected"
   ],
   "duration": 41,
   "audio": "https://cdn.snowstar.company/audio/5305532397125632.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/chasing-nights.jpg",
   "moods": [
    "Party",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 120,
   "vocal": "Vocals",
   "key": "C#",
   "scale": "minor"
  },
  {
   "title": "CHASING NIGHTS + VOX (SQUARE)",
   "slug": "chasing-nights-vox-square",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 42,
   "audio": "https://cdn.snowstar.company/audio-src/chasing-nights-vox-square.m4a",
   "cover": "https://cdn.snowstar.company/covers-art-sm/chasing-nights-vox-square.jpg",
   "moods": [
    "Party",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 120,
   "vocal": "Vocals",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "CHICHO LINDO",
   "slug": "chicho-lindo",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 180,
   "audio": "https://cdn.snowstar.company/audio/5124682078486528.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/chicho-lindo.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 100,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "CHOCOLATE MILK FACTORY",
   "slug": "chocolate-milk-factory",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 45,
   "audio": "https://cdn.snowstar.company/audio/5007088625385472.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/chocolate-milk-factory.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 143,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "major"
  },
  {
   "title": "CIRCUS",
   "slug": "circus",
   "artist": "Ori Toledano",
   "genres": [
    "Retro 8-Bit"
   ],
   "packages": [],
   "duration": 144,
   "audio": "https://cdn.snowstar.company/audio-src/circus.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/circus.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 161,
   "vocal": "Instrumental",
   "key": "Ab",
   "scale": "major"
  },
  {
   "title": "CLIMAX - DRAMATIC TRAILER",
   "slug": "climax-dramatic-trailer",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Cinematic"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 18,
   "audio": "https://cdn.snowstar.company/audio/6555200997294080.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/climax-dramatic-trailer.jpg",
   "moods": [
    "Epic"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 152,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "minor"
  },
  {
   "title": "COLD SUMMER DAY",
   "slug": "cold-summer-day",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 36,
   "audio": "https://cdn.snowstar.company/audio/4870403203792896.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/cold-summer-day.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental"
   ],
   "bpm": 136,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "COLLINS AVE",
   "slug": "collins-ave",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 182,
   "audio": "https://cdn.snowstar.company/audio/5546894543552512.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/collins-ave.jpg",
   "moods": [
    "Party",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 130,
   "vocal": "Vocals",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "COMING HOME",
   "slug": "coming-home",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 99,
   "audio": "https://cdn.snowstar.company/audio/6532056962039808.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/coming-home.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano",
    "Strings"
   ],
   "bpm": 85,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "COMING HOME - PIANO ONLY",
   "slug": "coming-home-piano-only",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [],
   "duration": 90,
   "audio": "https://cdn.snowstar.company/audio-src/coming-home-piano-only.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/coming-home-piano-only.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano"
   ],
   "bpm": 85,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "CONFRONTATION",
   "slug": "confrontation",
   "artist": "Ori Toledano",
   "genres": [
    "Cinematic",
    "Classical"
   ],
   "packages": [],
   "duration": 169,
   "audio": "https://cdn.snowstar.company/audio-src/confrontation.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/confrontation.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 62,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "CUT ME LOOSE (INSTRUMENTAL)",
   "slug": "cut-me-loose-instrumental",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 159,
   "audio": "https://cdn.snowstar.company/audio/6733854456938496.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/cut-me-loose-instrumental.jpg",
   "moods": [
    "Aggressive",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 150,
   "vocal": "Vocals",
   "key": "E",
   "scale": "major"
  },
  {
   "title": "CUT ME LOOSE (SHORT)",
   "slug": "cut-me-loose-short",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Indie"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 18,
   "audio": "https://cdn.snowstar.company/audio/6751446642982912.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/cut-me-loose-short.jpg",
   "moods": [
    "Aggressive",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 151,
   "vocal": "Vocals",
   "key": "E",
   "scale": "major"
  },
  {
   "title": "CYBER TUNNEL",
   "slug": "cyber-tunnel",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Ambient"
   ],
   "packages": [],
   "duration": 41,
   "audio": "https://cdn.snowstar.company/audio-src/cyber-tunnel.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/cyber-tunnel.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 130,
   "vocal": "Instrumental",
   "key": "C#",
   "scale": "minor"
  },
  {
   "title": "DAFFODIL WITHOUT A SUNLIGHT",
   "slug": "daffodil-without-a-sunlight",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 68,
   "audio": "https://cdn.snowstar.company/audio-src/daffodil-without-a-sunlight.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/daffodil-without-a-sunlight.jpg",
   "moods": [
    "Happy"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 122,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "DANCE FOR TRIOMPHE",
   "slug": "dance-for-triomphe",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 91,
   "audio": "https://cdn.snowstar.company/audio/5454541002637312.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/dance-for-triomphe.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 126,
   "vocal": "Vocals",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "DARK DOTS",
   "slug": "dark-dots",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [
    "Shilton Haztlalim"
   ],
   "duration": 82,
   "audio": "https://cdn.snowstar.company/audio/4571895989010432.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/dark-dots.jpg",
   "moods": [
    "Dramatic",
    "Dark",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano"
   ],
   "bpm": 148,
   "vocal": "Instrumental",
   "key": "Bb",
   "scale": "major"
  },
  {
   "title": "DARK FACTORY",
   "slug": "dark-factory",
   "artist": "Dalit Nemirovsky",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 73,
   "audio": "https://cdn.snowstar.company/audio-extra/dark-factory.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/dark-factory.jpg",
   "moods": [
    "Dark",
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "DAY DREAMER",
   "slug": "day-dreamer",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Chill / Lo-Fi"
   ],
   "packages": [
    "Selected"
   ],
   "duration": 141,
   "audio": "https://cdn.snowstar.company/audio/5600329422864384.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/day-dreamer.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 90,
   "vocal": "Instrumental",
   "key": "B",
   "scale": "major"
  },
  {
   "title": "DEEP UNDERWATER",
   "slug": "deep-underwater",
   "artist": "Ori Toledano",
   "genres": [
    "Classical",
    "Ambient"
   ],
   "packages": [],
   "duration": 211,
   "audio": "https://cdn.snowstar.company/audio/5722816403996672.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/deep-underwater.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental",
    "Piano"
   ],
   "bpm": 123,
   "vocal": "Instrumental",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "DEMOLITION MISSION",
   "slug": "demolition-mission",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Electronic"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 297,
   "audio": "https://cdn.snowstar.company/audio-extra/demolition-mission.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/demolition-mission.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "DEPECHE MODE - TAINTED LOVE (ORI TOLEDANO MUSICAL REMIX)",
   "slug": "depeche-mode-tainted-love-ori-toledano-musical-remix",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Dance"
   ],
   "packages": [],
   "duration": 194,
   "audio": "https://cdn.snowstar.company/audio/6628813985284096.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/depeche-mode-tainted-love-ori-toledano-musical-remix.jpg",
   "moods": [
    "Playful",
    "Romantic"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 120,
   "vocal": "Vocals",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "DIRTY DANCEFLOOR",
   "slug": "dirty-dancefloor",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 64,
   "audio": "https://cdn.snowstar.company/audio/5335788311019520.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/dirty-dancefloor.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "DIRTY MONEY",
   "slug": "dirty-money",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Hip Hop"
   ],
   "packages": [],
   "duration": 102,
   "audio": "https://cdn.snowstar.company/audio/4702469613420544.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/dirty-money.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 161,
   "vocal": "Vocals"
  },
  {
   "title": "DO IT MAJOR",
   "slug": "do-it-major",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 42,
   "audio": "https://cdn.snowstar.company/audio-src/do-it-major.m4a",
   "cover": "https://cdn.snowstar.company/covers-art-sm/do-it-major.jpg",
   "moods": [
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 103,
   "vocal": "Vocals",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "DRAMATIC CLIMAX TIZER (GUITAR FEEDBACK)",
   "slug": "dramatic-climax-tizer-guitar-feedback",
   "artist": "Ori Toledano",
   "genres": [
    "Metal",
    "Dance"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 15,
   "audio": "https://cdn.snowstar.company/audio/4506243899064320.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/dramatic-climax-tizer-guitar-feedback.jpg",
   "moods": [
    "Epic"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 123,
   "vocal": "Vocals",
   "key": "Eb",
   "scale": "major"
  },
  {
   "title": "DRAMATIC STING",
   "slug": "dramatic-sting",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 11,
   "audio": "https://cdn.snowstar.company/audio/5632143805906944.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/dramatic-sting.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 145,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "DVASH (PLAYBACK)",
   "slug": "dvash-playback",
   "artist": "Ori Toledano",
   "genres": [
    "Indie",
    "Rock"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 156,
   "audio": "https://cdn.snowstar.company/audio/4675568689741824.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/dvash-playback.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 97,
   "vocal": "Vocals",
   "key": "B",
   "scale": "minor"
  },
  {
   "title": "EASTCOUNTRY",
   "slug": "eastcountry",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 79,
   "audio": "https://cdn.snowstar.company/audio/5230235194753024.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/eastcountry.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano",
    "Strings"
   ],
   "bpm": 146,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "EITAN CHINITZ - PRAY",
   "slug": "eitan-chinitz-pray",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "House & Techno"
   ],
   "packages": [],
   "duration": 170,
   "audio": "https://cdn.snowstar.company/audio-src/eitan-chinitz-pray.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/eitan-chinitz-pray.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 100,
   "vocal": "Vocals",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "ELECTRO SWETHEART",
   "slug": "electro-swetheart",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Dance"
   ],
   "packages": [],
   "duration": 233,
   "audio": "https://cdn.snowstar.company/audio/5538098450530304.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/electro-swetheart.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 130,
   "vocal": "Vocals",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "ELEGANCE STING",
   "slug": "elegance-sting",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic"
   ],
   "packages": [],
   "duration": 8,
   "audio": "https://cdn.snowstar.company/audio/5367532330418176.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/elegance-sting.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [],
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "ELVES LAND (AGGRESSED)",
   "slug": "elves-land-aggressed",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 61,
   "audio": "https://cdn.snowstar.company/audio/6414463508938752.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/elves-land-aggressed.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 83,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "ELVES LAND (SOFT)",
   "slug": "elves-land-soft",
   "artist": "Ori Toledano",
   "genres": [
    "Classical",
    "Cinematic"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 61,
   "audio": "https://cdn.snowstar.company/audio/6132988532228096.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/elves-land-soft.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 109,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "EMOTIONAL STING",
   "slug": "emotional-sting",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 11,
   "audio": "https://cdn.snowstar.company/audio/5069193852485632.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/emotional-sting.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 97,
   "vocal": "Instrumental",
   "key": "C#",
   "scale": "major"
  },
  {
   "title": "EP",
   "slug": "ep",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [],
   "duration": 58,
   "audio": "https://cdn.snowstar.company/audio/5695915480317952.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/ep.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 99,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "EP. 2 Q26 - DARK DOTS",
   "slug": "ep-2-q26-dark-dots",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [],
   "duration": 82,
   "audio": "https://cdn.snowstar.company/audio/6716262270894080.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/ep-2-q26-dark-dots.jpg",
   "moods": [
    "Dramatic",
    "Dark",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano"
   ],
   "bpm": 148,
   "vocal": "Instrumental",
   "key": "Bb",
   "scale": "major"
  },
  {
   "title": "EPIC FAST DRUMS",
   "slug": "epic-fast-drums",
   "artist": "Ori Toledano",
   "genres": [
    "Jazz & Blues",
    "Electronic"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 21,
   "audio": "https://cdn.snowstar.company/audio/5758000776085504.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/epic-fast-drums.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 80,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "EPIC HANYE BEST",
   "slug": "epic-hanye-best",
   "artist": "Ori Toledano",
   "genres": [
    "Hip Hop",
    "Chill / Lo-Fi"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 144,
   "audio": "https://cdn.snowstar.company/audio/4725613648674816.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/epic-hanye-best.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 90,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "major"
  },
  {
   "title": "EPIC JOURNEY",
   "slug": "epic-journey",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Classical"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 45,
   "audio": "https://cdn.snowstar.company/audio/5570038578806784.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/epic-journey.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 93,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "EPIC JOURNEY (TAMED)",
   "slug": "epic-journey-tamed",
   "artist": "Ori Toledano",
   "genres": [
    "Cinematic",
    "Ambient"
   ],
   "packages": [],
   "duration": 32,
   "audio": "https://cdn.snowstar.company/audio/5942718729551872.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/epic-journey-tamed.jpg",
   "moods": [
    "Epic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 130,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "major"
  },
  {
   "title": "ETHNIC GLAM",
   "slug": "ethnic-glam",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 241,
   "audio": "https://cdn.snowstar.company/audio/4913575845953536.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/ethnic-glam.jpg",
   "moods": [
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 116,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "ETHNIC POP",
   "slug": "ethnic-pop",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 85,
   "audio": "https://cdn.snowstar.company/audio/5195050822664192.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/ethnic-pop.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 102,
   "vocal": "Vocals",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "EVERY RIGHT TO BE WITH YOU",
   "slug": "every-right-to-be-with-you",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "Indie"
   ],
   "packages": [],
   "duration": 187,
   "audio": "https://cdn.snowstar.company/audio/6637610078306304.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/every-right-to-be-with-you.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 140,
   "vocal": "Vocals",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "EVILOVE",
   "slug": "evilove",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [
    "Shilton Haztlalim"
   ],
   "duration": 98,
   "audio": "https://cdn.snowstar.company/audio/5590362364051456.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/evilove.jpg",
   "moods": [
    "Dramatic",
    "Dark"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 112,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "minor"
  },
  {
   "title": "EVILOVE CHAOS",
   "slug": "evilove-chaos",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [
    "Selected",
    "Shilton Haztlalim"
   ],
   "duration": 89,
   "audio": "https://cdn.snowstar.company/audio/6153312317472768.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/evilove-chaos.jpg",
   "moods": [
    "Dramatic",
    "Dark"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 112,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "minor"
  },
  {
   "title": "FALLING OUT OF LOVE (INSTRUMENTAL)",
   "slug": "falling-out-of-love-instrumental",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 214,
   "audio": "https://cdn.snowstar.company/audio/4610116072505344.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/falling-out-of-love-instrumental.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 120,
   "vocal": "Vocals",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "FAMILY GIRL (MUSICAL)",
   "slug": "family-girl-musical",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 31,
   "audio": "https://cdn.snowstar.company/audio/6672794450395136.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/family-girl-musical.jpg",
   "moods": [
    "Uplifting",
    "Romantic",
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Piano",
    "Vocals"
   ],
   "bpm": 145,
   "vocal": "Vocals",
   "key": "G",
   "scale": "major"
  },
  {
   "title": "FAR WE ARE",
   "slug": "far-we-are",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Dance"
   ],
   "packages": [],
   "duration": 128,
   "audio": "https://cdn.snowstar.company/audio/4808022729687040.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/far-we-are.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 122,
   "vocal": "Vocals",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "FAR WE ARE - SHORT EDIT",
   "slug": "far-we-are-short-edit",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "House & Techno"
   ],
   "packages": [],
   "duration": 79,
   "audio": "https://cdn.snowstar.company/audio-src/far-we-are-short-edit.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/far-we-are-short-edit.jpg",
   "moods": [
    "Uplifting"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 123,
   "vocal": "Vocals",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "FESTIGAL",
   "slug": "festigal",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "House & Techno"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 234,
   "audio": "https://cdn.snowstar.company/audio/4623304776220672.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/festigal.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 120,
   "vocal": "Vocals",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "FIVE ROCKS",
   "slug": "five-rocks",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 45,
   "audio": "https://cdn.snowstar.company/audio-src/five-rocks.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/five-rocks.jpg",
   "moods": [
    "Tense",
    "Aggressive"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 129,
   "vocal": "Vocals",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "FLAWLESS",
   "slug": "flawless",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "House & Beyond"
   ],
   "duration": 385,
   "audio": "https://cdn.snowstar.company/audio/6132505113526272.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/flawless.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "FRANKY BUSTY BOOBS",
   "slug": "franky-busty-boobs",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "House & Beyond"
   ],
   "duration": 373,
   "audio": "https://cdn.snowstar.company/audio/5569555160104960.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/franky-busty-boobs.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 126,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "FREEDOM CITY (INSTRUMENTAL)",
   "slug": "freedom-city-instrumental",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 334,
   "audio": "https://cdn.snowstar.company/audio/5806384723525632.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/freedom-city-instrumental.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Synth",
    "Vocals"
   ],
   "bpm": 128,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "FRENCH BALKAN",
   "slug": "french-balkan",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Latin"
   ],
   "packages": [],
   "duration": 66,
   "audio": "https://cdn.snowstar.company/audio/6039475752796160.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/french-balkan.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 110,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "FUN SUMMER BASS",
   "slug": "fun-summer-bass",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 30,
   "audio": "https://cdn.snowstar.company/audio/6320950729506816.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/fun-summer-bass.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Instrumental"
   ],
   "bpm": 110,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "FUNKY WURLI TRIPLET",
   "slug": "funky-wurli-triplet",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Vintage"
   ],
   "duration": 109,
   "audio": "https://cdn.snowstar.company/audio/5606945635434496.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/funky-wurli-triplet.jpg",
   "moods": [
    "Happy"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 90,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "FUTURE SODOM",
   "slug": "desert-desire",
   "artist": "Ori Toledano",
   "genres": [
    "Cinematic",
    "Ambient"
   ],
   "packages": [],
   "duration": 61,
   "audio": "https://cdn.snowstar.company/audio/6149957327257600.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/desert-desire.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 90,
   "vocal": "Instrumental",
   "key": "Eb",
   "scale": "minor"
  },
  {
   "title": "FUZZY CATS",
   "slug": "fuzzy-cats",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 18,
   "audio": "https://cdn.snowstar.company/audio/6013087473729536.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/fuzzy-cats.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 137,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "GANGSTA RIDE",
   "slug": "gangsta-ride",
   "artist": "Ori Toledano",
   "genres": [
    "Hip Hop"
   ],
   "packages": [],
   "duration": 49,
   "audio": "https://cdn.snowstar.company/audio/4588120404131840.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/gangsta-ride.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 156,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "GIRL IN RED",
   "slug": "girl-in-red",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "House & Techno"
   ],
   "packages": [],
   "duration": 22,
   "audio": "https://cdn.snowstar.company/audio/6559253064056832.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/girl-in-red.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 116,
   "vocal": "Instrumental",
   "key": "F#",
   "scale": "major"
  },
  {
   "title": "GLIDA",
   "slug": "glida",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Funk & Soul"
   ],
   "packages": [],
   "duration": 208,
   "audio": "https://cdn.snowstar.company/audio/5115885985464320.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/glida.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 120,
   "vocal": "Vocals",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "GONE IN A SEC",
   "slug": "gone-in-a-sec",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 430,
   "audio": "https://cdn.snowstar.company/audio/5714020310974464.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/gone-in-a-sec.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 124,
   "vocal": "Vocals",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "GONE IN A SEC - PLAYBACK",
   "slug": "gone-in-a-sec-playback",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 430,
   "audio": "https://cdn.snowstar.company/audio/5045517241286656.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/gone-in-a-sec-playback.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Synth",
    "Vocals"
   ],
   "bpm": 124,
   "vocal": "Vocals",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "GOOD OLD DAYS",
   "slug": "good-old-days",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 30,
   "audio": "https://cdn.snowstar.company/audio/6356135101595648.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/good-old-days.jpg",
   "moods": [
    "Happy"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 141,
   "vocal": "Vocals",
   "key": "E",
   "scale": "major"
  },
  {
   "title": "GOOD THINGS",
   "slug": "good-things",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 52,
   "audio": "https://cdn.snowstar.company/audio/5749204683063296.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/good-things.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 113,
   "vocal": "Vocals",
   "key": "B",
   "scale": "major"
  },
  {
   "title": "GOOD THINGS (PLAYBACK)",
   "slug": "good-things-playback",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 52,
   "audio": "https://cdn.snowstar.company/audio/4948760218042368.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/good-things-playback.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental"
   ],
   "bpm": 113,
   "vocal": "Instrumental",
   "key": "B",
   "scale": "major"
  },
  {
   "title": "GREAT POWERS",
   "slug": "great-powers",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Vintage"
   ],
   "duration": 210,
   "audio": "https://cdn.snowstar.company/audio/4834411008753664.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/great-powers.jpg",
   "moods": [
    "Happy",
    "Uplifting"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 102,
   "vocal": "Vocals",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "GREAT POWERS (AGRESSIVE MIX PLAYBACK)",
   "slug": "great-powers-agressive-mix-playback",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 292,
   "audio": "https://cdn.snowstar.company/audio/6241785892306944.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/great-powers-agressive-mix-playback.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 120,
   "vocal": "Vocals",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "HAILO OF THE MOON (INSTRUMENTAL)",
   "slug": "hailo-of-the-moon-instrumental",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 223,
   "audio": "https://cdn.snowstar.company/audio/5736015979347968.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/hailo-of-the-moon-instrumental.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 126,
   "vocal": "Vocals",
   "key": "Ab",
   "scale": "minor"
  },
  {
   "title": "HALUTZIM - LIES PLAYBACK",
   "slug": "halutzim-lies-playback",
   "artist": "Ori Toledano",
   "genres": [
    "Hip Hop",
    "Dance"
   ],
   "packages": [],
   "duration": 165,
   "audio": "https://cdn.snowstar.company/audio-src/halutzim-lies-playback.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/halutzim-lies-playback.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 90,
   "vocal": "Vocals",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "HEAVY ACTION",
   "slug": "heavy-action",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Cinematic"
   ],
   "packages": [],
   "duration": 35,
   "audio": "https://cdn.snowstar.company/audio/5379768776130560.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/heavy-action.jpg",
   "moods": [
    "Dramatic",
    "Tense",
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 80,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "minor"
  },
  {
   "title": "HEAVY PULSES",
   "slug": "heavy-pulses",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 32,
   "audio": "https://cdn.snowstar.company/audio/6074660124884992.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/heavy-pulses.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 120,
   "vocal": "Vocals",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "HEILO PAD",
   "slug": "heilo-pad",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [],
   "duration": 91,
   "audio": "https://cdn.snowstar.company/audio/5476525799374848.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/heilo-pad.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 126,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "major"
  },
  {
   "title": "HELLO WORLD (EPIC)",
   "slug": "hello-world-epic",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 37,
   "audio": "https://cdn.snowstar.company/audio/5126989616775168.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/hello-world-epic.jpg",
   "moods": [
    "Epic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano"
   ],
   "bpm": 154,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "HELLO WORLD (SOFT)",
   "slug": "hello-world-soft",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 34,
   "audio": "https://cdn.snowstar.company/audio/6252889523617792.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/hello-world-soft.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano"
   ],
   "bpm": 153,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "HERE COMES THE BEST",
   "slug": "here-comes-the-best",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 60,
   "audio": "https://cdn.snowstar.company/audio/5801468596584448.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/here-comes-the-best.jpg",
   "moods": [
    "Aggressive",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 152,
   "vocal": "Vocals",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "HERE WE GO AGAIN",
   "slug": "here-we-go-again",
   "artist": "Ori Toledano",
   "genres": [
    "Hip Hop",
    "Pop"
   ],
   "packages": [],
   "duration": 129,
   "audio": "https://cdn.snowstar.company/audio/6602425706217472.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/here-we-go-again.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 70,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "HI-TECH INNOVATIVE (SHORT PIANO REFF)",
   "slug": "hi-tech-innovative-short-piano-reff",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 28,
   "audio": "https://cdn.snowstar.company/audio/6195093759328256.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/hi-tech-innovative-short-piano-reff.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 136,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "HIPSTA FLITZ",
   "slug": "hipsta-flitz",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 64,
   "audio": "https://cdn.snowstar.company/audio/4975148497108992.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/hipsta-flitz.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 120,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "HIT'EM WITH A BASS DROP",
   "slug": "hit-em-with-a-bass-drop",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 67,
   "audio": "https://cdn.snowstar.company/audio-src/hit-em-with-a-bass-drop.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/hit-em-with-a-bass-drop.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 100,
   "vocal": "Vocals",
   "key": "F",
   "scale": "minor"
  },
  {
   "title": "HOME (INSTRUMENTAL)",
   "slug": "home-instrumental",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [],
   "duration": 242,
   "audio": "https://cdn.snowstar.company/audio/5151070357553152.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/home-instrumental.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 96,
   "vocal": "Instrumental",
   "key": "Ab",
   "scale": "minor"
  },
  {
   "title": "HONEY I'M HOME",
   "slug": "honey-i-m-home",
   "artist": "Ori Toledano",
   "genres": [
    "Cinematic"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 51,
   "audio": "https://cdn.snowstar.company/audio/4772838357598208.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/honey-i-m-home.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 118,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "HOODY TRAP",
   "slug": "hoody-trap",
   "artist": "Ori Toledano",
   "genres": [
    "Hip Hop"
   ],
   "packages": [],
   "duration": 54,
   "audio": "https://cdn.snowstar.company/audio/5872349985374208.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/hoody-trap.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 150,
   "vocal": "Vocals",
   "key": "G",
   "scale": "major"
  },
  {
   "title": "HOOLYWOOD CRIBS",
   "slug": "hoolywood-cribs",
   "artist": "Ori Toledano",
   "genres": [
    "Hip Hop"
   ],
   "packages": [
    "Selected"
   ],
   "duration": 65,
   "audio": "https://cdn.snowstar.company/audio/5587007373836288.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/hoolywood-cribs.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 96,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "HUMANOID LOVE",
   "slug": "humanoid-love",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Electronic"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 30,
   "audio": "https://cdn.snowstar.company/audio/6164564863352832.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/humanoid-love.jpg",
   "moods": [
    "Party",
    "Romantic"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 100,
   "vocal": "Vocals",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "I CAN'T STOP",
   "slug": "i-can-t-stop",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 117,
   "audio": "https://cdn.snowstar.company/audio/5186254729641984.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/i-can-t-stop.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 90,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "I SAY YY",
   "slug": "i-say-yy",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Dance"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 161,
   "audio": "https://cdn.snowstar.company/audio/5601614909931520.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/i-say-yy.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 110,
   "vocal": "Vocals",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "ICY ROLLER",
   "slug": "icy-roller",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Dance"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 134,
   "audio": "https://cdn.snowstar.company/audio/6727514816774144.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/icy-roller.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 115,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "INDIE POP WHISTLE",
   "slug": "indie-pop-whistle",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Electronic"
   ],
   "packages": [],
   "duration": 57,
   "audio": "https://cdn.snowstar.company/audio/6145028869062656.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/indie-pop-whistle.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Piano"
   ],
   "bpm": 110,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "major"
  },
  {
   "title": "INTRO",
   "slug": "intro",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Dance"
   ],
   "packages": [
    "Shilton Haztlalim"
   ],
   "duration": 17,
   "audio": "https://cdn.snowstar.company/audio/5095950718599168.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/intro.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 161,
   "vocal": "Vocals",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "ISHA",
   "slug": "isha",
   "artist": "Ori Toledano",
   "genres": [
    "Funk & Soul"
   ],
   "packages": [],
   "duration": 168,
   "audio": "https://cdn.snowstar.company/audio/5960310915596288.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/isha.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 82,
   "vocal": "Vocals",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "JACK BLACK (SHORT)",
   "slug": "jack-black-short",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 15,
   "audio": "https://cdn.snowstar.company/audio/5942206084939776.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/jack-black-short.jpg",
   "moods": [
    "Aggressive",
    "Happy"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 80,
   "vocal": "Vocals",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "JANE",
   "slug": "jane",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 207,
   "audio": "https://cdn.snowstar.company/audio/6298965932769280.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/jane.jpg",
   "moods": [
    "Party",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 124,
   "vocal": "Vocals",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "JANE SINATRA",
   "slug": "jane-sinatra",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Funk & Soul"
   ],
   "packages": [
    "Vintage"
   ],
   "duration": 153,
   "audio": "https://cdn.snowstar.company/audio/6169895588855808.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/jane-sinatra.jpg",
   "moods": [
    "Happy",
    "Uplifting"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 132,
   "vocal": "Vocals",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "JAPAN FIGHT",
   "slug": "japan-fight",
   "artist": "Ori Toledano",
   "genres": [
    "Cinematic"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 33,
   "audio": "https://cdn.snowstar.company/audio/6461688217862144.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/japan-fight.jpg",
   "moods": [
    "Epic",
    "Tense"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 140,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "JAPAN FLUTES",
   "slug": "japan-flutes",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [],
   "duration": 28,
   "audio": "https://cdn.snowstar.company/audio/5054313334308864.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/japan-flutes.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 137,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "minor"
  },
  {
   "title": "JAQLEEN BIETER",
   "slug": "jaqleen-bieter",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Latin"
   ],
   "packages": [],
   "duration": 66,
   "audio": "https://cdn.snowstar.company/audio/4517751659954176.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/jaqleen-bieter.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 94,
   "vocal": "Vocals",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "JAZZ SWING (SAX - LIGHT)",
   "slug": "jazz-swing-sax-light",
   "artist": "Ori Toledano",
   "genres": [
    "Jazz & Blues"
   ],
   "packages": [],
   "duration": 56,
   "audio": "https://cdn.snowstar.company/audio/5080701613375488.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/jazz-swing-sax-light.jpg",
   "moods": [
    "Romantic",
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Piano"
   ],
   "bpm": 151,
   "vocal": "Instrumental",
   "key": "Eb",
   "scale": "major"
  },
  {
   "title": "JAZZ SWING (SAX)",
   "slug": "jazz-swing-sax",
   "artist": "Ori Toledano",
   "genres": [
    "Jazz & Blues"
   ],
   "packages": [],
   "duration": 81,
   "audio": "https://cdn.snowstar.company/audio/6206601520218112.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/jazz-swing-sax.jpg",
   "moods": [
    "Romantic",
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Piano"
   ],
   "bpm": 163,
   "vocal": "Instrumental",
   "key": "Eb",
   "scale": "major"
  },
  {
   "title": "JAZZY FUNK JAM",
   "slug": "jazzy-funk-jam",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "Dance"
   ],
   "packages": [],
   "duration": 220,
   "audio": "https://cdn.snowstar.company/audio/6276970264395776.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/jazzy-funk-jam.jpg",
   "moods": [
    "Uplifting"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Instrumental",
    "Piano"
   ],
   "bpm": 100,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "JIMMY CHOO",
   "slug": "jimmy-choo",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Funk & Soul"
   ],
   "packages": [
    "Selected"
   ],
   "duration": 116,
   "audio": "https://cdn.snowstar.company/audio/4566660583260160.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/jimmy-choo.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Instrumental"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "JOKER UP MY SLEEVE",
   "slug": "4-joker-up-my-sleeve",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Rock"
   ],
   "packages": [],
   "duration": 143,
   "audio": "https://cdn.snowstar.company/audio/4710753061830656.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/4-joker-up-my-sleeve.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 80,
   "vocal": "Vocals",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "JUST LIKE ME",
   "slug": "just-like-me",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Indie"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 222,
   "audio": "https://cdn.snowstar.company/audio/5097781154807808.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/just-like-me.jpg",
   "moods": [
    "Aggressive"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 135,
   "vocal": "Vocals",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "KAVIAR WOMAN (LONG)",
   "slug": "kaviar-woman-long",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "World"
   ],
   "packages": [
    "Vintage"
   ],
   "duration": 206,
   "audio": "https://cdn.snowstar.company/audio/5043995682013184.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/kaviar-woman-long.jpg",
   "moods": [
    "Uplifting"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 114,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "KAVIAR WOMAN (SHORT)",
   "slug": "kaviar-woman-short",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "House & Techno"
   ],
   "packages": [
    "Vintage"
   ],
   "duration": 30,
   "audio": "https://cdn.snowstar.company/audio/6732845542277120.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/kaviar-woman-short.jpg",
   "moods": [
    "Uplifting"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 114,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "KAVIAR WOMAN - MINIMAL EDIT",
   "slug": "kaviar-woman-minimal-edit",
   "artist": "Ori Toledano",
   "genres": [
    "Funk & Soul"
   ],
   "packages": [
    "Vintage"
   ],
   "duration": 206,
   "audio": "https://cdn.snowstar.company/audio/4777163993645056.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/kaviar-woman-minimal-edit.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Instrumental"
   ],
   "bpm": 113,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "KINDER FUN",
   "slug": "kinder-fun",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 16,
   "audio": "https://cdn.snowstar.company/audio/4957556311064576.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/kinder-fun.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 112,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "KINGSTON'S SHAKE",
   "slug": "kingston-s-shake",
   "artist": "Ori Toledano",
   "genres": [
    "Hip Hop"
   ],
   "packages": [],
   "duration": 98,
   "audio": "https://cdn.snowstar.company/audio/4799226636664832.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/kingston-s-shake.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 96,
   "vocal": "Vocals",
   "key": "C#",
   "scale": "major"
  },
  {
   "title": "KNESET NEW 2 -- 18.12.17",
   "slug": "kneset-new-2-18-12-17",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 32,
   "audio": "https://cdn.snowstar.company/audio/4745937433919488.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/kneset-new-2-18-12-17.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 104,
   "vocal": "Instrumental",
   "key": "Ab",
   "scale": "major"
  },
  {
   "title": "KNOCK KNOCK",
   "slug": "knock-knock",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 196,
   "audio": "https://cdn.snowstar.company/audio/5024057420414976.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/knock-knock.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "KNOCK KNOCK - DRUM & PERCS",
   "slug": "knock-knock-drum-percs",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 196,
   "audio": "https://cdn.snowstar.company/audio-src/knock-knock-drum-percs.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/knock-knock-drum-percs.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "major"
  },
  {
   "title": "KNOWN UNKNOWN",
   "slug": "known-unknown",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Indie"
   ],
   "packages": [],
   "duration": 203,
   "audio": "https://cdn.snowstar.company/audio/5898738264440832.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/known-unknown.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 110,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "KUZO'S DREAM",
   "slug": "kuzo-s-dream",
   "artist": "Ori Toledano",
   "genres": [
    "Cinematic",
    "Dance"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 42,
   "audio": "https://cdn.snowstar.company/audio/4704777151709184.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/kuzo-s-dream.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental",
    "Strings"
   ],
   "bpm": 138,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "LABA MAZE",
   "slug": "laba-maze",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [],
   "duration": 228,
   "audio": "https://cdn.snowstar.company/audio/6431432303968256.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/laba-maze.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 161,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "LALADIN YAAKOV (PLAYBACK REDO)",
   "slug": "laladin-yaakov-playback-redo",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 153,
   "audio": "https://cdn.snowstar.company/audio-src/laladin-yaakov-playback-redo.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/laladin-yaakov-playback-redo.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 130,
   "vocal": "Vocals",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "LAPAM - RAV SAL - MAIN (SAGIR MUSIC PLAYBACK)",
   "slug": "lapam-rav-sal-main-sagir-music-playback",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 5,
   "audio": "https://cdn.snowstar.company/audio/5925126543507456.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/lapam-rav-sal-main-sagir-music-playback.jpg",
   "moods": [
    "Aggressive",
    "Happy"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 98,
   "vocal": "Vocals",
   "key": "B",
   "scale": "minor"
  },
  {
   "title": "LAST EPISODES THEME",
   "slug": "last-episodes-theme",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Dance"
   ],
   "packages": [
    "Shilton Haztlalim"
   ],
   "duration": 150,
   "audio": "https://cdn.snowstar.company/audio/5658900672020480.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/last-episodes-theme.jpg",
   "moods": [
    "Aggressive"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 80,
   "vocal": "Vocals",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "LATER SWISS",
   "slug": "later-swiss",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 43,
   "audio": "https://cdn.snowstar.company/audio/6452892124839936.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/later-swiss.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 90,
   "vocal": "Instrumental",
   "key": "B",
   "scale": "minor"
  },
  {
   "title": "LATUS",
   "slug": "latus",
   "artist": "Ori Toledano",
   "genres": [
    "Funk & Soul",
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 212,
   "audio": "https://cdn.snowstar.company/audio/5397360962174976.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/latus.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 86,
   "vocal": "Vocals",
   "key": "Ab",
   "scale": "major"
  },
  {
   "title": "LIES & DECEPTION",
   "slug": "lies-deception",
   "artist": "Ori Toledano",
   "genres": [
    "Classical",
    "Cinematic"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 128,
   "audio": "https://cdn.snowstar.company/audio/6695938485649408.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/lies-deception.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 156,
   "vocal": "Instrumental",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "LILY WEST",
   "slug": "lily-west",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 224,
   "audio": "https://cdn.snowstar.company/audio/6426503845773312.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/lily-west.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 102,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "LITTLE BIG ADVENTURE",
   "slug": "little-big-adventure",
   "artist": "Ori Toledano",
   "genres": [
    "Classical",
    "Cinematic"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 41,
   "audio": "https://cdn.snowstar.company/audio/5830677058551808.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/little-big-adventure.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 143,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "major"
  },
  {
   "title": "LOLA MARSH - WISHING GIRL (ORI TOLEDANO & GIL LANDAU REMIX)",
   "slug": "lola-marsh-wishing-girl-ori-toledano-gil-landau-remix",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 191,
   "audio": "https://cdn.snowstar.company/audio/6171417148129280.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/lola-marsh-wishing-girl-ori-toledano-gil-landau-remix.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 118,
   "vocal": "Vocals",
   "key": "B",
   "scale": "minor"
  },
  {
   "title": "LONELY ROAD",
   "slug": "lonely-road",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 106,
   "audio": "https://cdn.snowstar.company/audio/4869595380842496.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/lonely-road.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 87,
   "vocal": "Vocals",
   "key": "B",
   "scale": "major"
  },
  {
   "title": "LOST IN MARAKESH (FULL)",
   "slug": "lost-in-marakesh-full",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 205,
   "audio": "https://cdn.snowstar.company/audio/5995495287685120.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/lost-in-marakesh-full.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 124,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "LOST IN MARAKESH (LIGHT)",
   "slug": "lost-in-marakesh-light",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Dance"
   ],
   "packages": [],
   "duration": 85,
   "audio": "https://cdn.snowstar.company/audio/5432545334263808.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/lost-in-marakesh-light.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 124,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "LOST IN MARAKESH (SHORT)",
   "slug": "lost-in-marakesh-short",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 31,
   "audio": "https://cdn.snowstar.company/audio/6558445241106432.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/lost-in-marakesh-short.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 124,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "LOVE NEVER END (INSTRUMENTAL)",
   "slug": "love-never-end-instrumental",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 289,
   "audio": "https://cdn.snowstar.company/audio/6650809653657600.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/love-never-end-instrumental.jpg",
   "moods": [
    "Party",
    "Romantic"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 128,
   "vocal": "Instrumental",
   "key": "C#",
   "scale": "minor"
  },
  {
   "title": "LOVE TO LOVE YOU",
   "slug": "love-to-love-you",
   "artist": "Ori Toledano",
   "genres": [
    "Funk & Soul",
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 170,
   "audio": "https://cdn.snowstar.company/audio/6523260869017600.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/love-to-love-you.jpg",
   "moods": [
    "Playful",
    "Romantic",
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 96,
   "vocal": "Vocals",
   "key": "F",
   "scale": "minor"
  },
  {
   "title": "LOW LOW LOW",
   "slug": "low-low-low",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 110,
   "audio": "https://cdn.snowstar.company/audio/4728857892487168.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/low-low-low.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 122,
   "vocal": "Instrumental",
   "key": "C#",
   "scale": "minor"
  },
  {
   "title": "MAGICAL MORNING",
   "slug": "magical-morning",
   "artist": "Ori Toledano",
   "genres": [
    "Cinematic",
    "Ambient"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 50,
   "audio": "https://cdn.snowstar.company/audio/5267727105130496.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/magical-morning.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 114,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "major"
  },
  {
   "title": "MAGICIAN",
   "slug": "magician",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Electronic"
   ],
   "packages": [],
   "duration": 114,
   "audio": "https://cdn.snowstar.company/audio/6101048403951616.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/magician.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Instrumental"
   ],
   "vocal": "Instrumental",
   "key": "F",
   "scale": "major"
  },
  {
   "title": "MAIN INTRO THEME - ACTION TENSION LONG V",
   "slug": "main-intro-theme-action-tension-long-v",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Dance"
   ],
   "packages": [],
   "duration": 150,
   "audio": "https://cdn.snowstar.company/audio/6294049805828096.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/main-intro-theme-action-tension-long-v.jpg",
   "moods": [
    "Tense"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 80,
   "vocal": "Vocals",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "MAIN INTRO THEME - FULL MIX - DARK",
   "slug": "main-intro-theme-full-mix-dark",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [],
   "duration": 158,
   "audio": "https://cdn.snowstar.company/audio/5168149898985472.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/main-intro-theme-full-mix-dark.jpg",
   "moods": [
    "Dramatic",
    "Dark"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 80,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "MAIN INTRO THEME - SHORT 9 FAVORITE _)",
   "slug": "main-intro-theme-short-9-favorite",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Dance"
   ],
   "packages": [],
   "duration": 17,
   "audio": "https://cdn.snowstar.company/audio/5731099852406784.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/main-intro-theme-short-9-favorite.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 161,
   "vocal": "Vocals",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "MAN IS GONE",
   "slug": "man-is-gone",
   "artist": "Ori Toledano",
   "genres": [
    "Funk & Soul"
   ],
   "packages": [
    "Vintage"
   ],
   "duration": 162,
   "audio": "https://cdn.snowstar.company/audio/4693673520398336.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/man-is-gone.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 78,
   "vocal": "Vocals",
   "key": "D",
   "scale": "major"
  },
  {
   "title": "MARIMBA FOREST",
   "slug": "marimba-forest",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Ambient"
   ],
   "packages": [
    "Electronica"
   ],
   "duration": 222,
   "audio": "https://cdn.snowstar.company/audio/5889429526806528.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/marimba-forest.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 115,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "MASSIVE ATTACK - DEAR DROP (ORI TOLEDANO",
   "slug": "massive-attack-dear-drop-ori-toledano",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 170,
   "audio": "https://cdn.snowstar.company/audio/4570015573475328.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/massive-attack-dear-drop-ori-toledano.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 118,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "MASSIVE ATTACK - TEAR DROP (TECHNO REMIX)",
   "slug": "massive-attack-tear-drop-techno-remix",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Shilton Haztlalim"
   ],
   "duration": 170,
   "audio": "https://cdn.snowstar.company/audio/6401431462477824.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/massive-attack-tear-drop-techno-remix.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 118,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "MATTER 1:4",
   "slug": "matter-1-4",
   "artist": "Ori Toledano",
   "genres": [
    "Cinematic",
    "Ambient"
   ],
   "packages": [],
   "duration": 179,
   "audio": "https://cdn.snowstar.company/audio-src/matter-1-4.m4a",
   "cover": "https://cdn.snowstar.company/covers-art-sm/matter-1-4.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 126,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "MEDUZA (REEF)",
   "slug": "meduza-reef",
   "artist": "Ori Toledano",
   "genres": [
    "Metal"
   ],
   "packages": [],
   "duration": 9,
   "audio": "https://cdn.snowstar.company/audio/5854757799329792.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/meduza-reef.jpg",
   "moods": [
    "Tense",
    "Aggressive"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 125,
   "vocal": "Vocals",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "MEGASTAR (INSTRUMENTAL)",
   "slug": "megastar-instrumental",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 196,
   "audio": "https://cdn.snowstar.company/audio/6087859700236288.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/megastar-instrumental.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 125,
   "vocal": "Vocals",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "MIDROAD PADS",
   "slug": "midroad-pads",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [],
   "duration": 184,
   "audio": "https://cdn.snowstar.company/audio/5996303110635520.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/midroad-pads.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 90,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "MONDRIAN DESERT DRIFT",
   "slug": "mondrian-desert-drift",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "House & Techno"
   ],
   "packages": [],
   "duration": 150,
   "audio": "https://cdn.snowstar.company/audio/5511710171463680.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/mondrian-desert-drift.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 128,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "MONDRIANS EMO DRIFT",
   "slug": "mondrians-emo-drift",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [],
   "duration": 114,
   "audio": "https://cdn.snowstar.company/audio/5362176590086144.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/mondrians-emo-drift.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental",
    "Piano"
   ],
   "bpm": 128,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "MR. SANDMAN (COVER)",
   "slug": "mr-sandman-cover",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic"
   ],
   "packages": [],
   "duration": 306,
   "audio": "https://cdn.snowstar.company/audio/5801981241196544.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/mr-sandman-cover.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 112,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "MUSICAL FAIRY",
   "slug": "musical-fairy",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 67,
   "audio": "https://cdn.snowstar.company/audio/4605712590176256.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/musical-fairy.jpg",
   "moods": [
    "Uplifting"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 142,
   "vocal": "Vocals",
   "key": "G",
   "scale": "major"
  },
  {
   "title": "MUTANTS",
   "slug": "mutants",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "Ambient"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 73,
   "audio": "https://cdn.snowstar.company/audio/5828369520263168.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/mutants.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 105,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "MY BELL MAMBO (BG VOX VER.)",
   "slug": "my-bell-mambo-bg-vox-ver",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 200,
   "audio": "https://cdn.snowstar.company/audio/6488076496928768.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/my-bell-mambo-bg-vox-ver.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 90,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "minor"
  },
  {
   "title": "MY LOVE",
   "slug": "my-love",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "House & Beyond"
   ],
   "duration": 273,
   "audio": "https://cdn.snowstar.company/audio/6695455066947584.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/my-love.jpg",
   "moods": [
    "Romantic"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 118,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "minor"
  },
  {
   "title": "MY LOVE SHORT",
   "slug": "my-love-short",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 21,
   "audio": "https://cdn.snowstar.company/audio/6505668682973184.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/my-love-short.jpg",
   "moods": [
    "Romantic"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 117,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "minor"
  },
  {
   "title": "NAZDA ROVIA",
   "slug": "nazda-rovia",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 243,
   "audio": "https://cdn.snowstar.company/audio/5608467194707968.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/nazda-rovia.jpg",
   "moods": [
    "Happy",
    "Uplifting"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 140,
   "vocal": "Vocals",
   "key": "D",
   "scale": "major"
  },
  {
   "title": "NERVS",
   "slug": "nervs",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Dance"
   ],
   "packages": [],
   "duration": 191,
   "audio": "https://cdn.snowstar.company/audio/4658489148309504.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/nervs.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 124,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "NEWS THEME - THE WORLD TODAY",
   "slug": "news-break-theme",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 79,
   "audio": "https://cdn.snowstar.company/audio/5027412410630144.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/news-break-theme.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 116,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "NI KOREA",
   "slug": "ni-korea",
   "artist": "Ori Toledano",
   "genres": [
    "Jazz & Blues"
   ],
   "packages": [],
   "duration": 52,
   "audio": "https://cdn.snowstar.company/audio-src/ni-korea.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/ni-korea.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Instrumental"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "B",
   "scale": "minor"
  },
  {
   "title": "NINJA ASSASSIN",
   "slug": "ninja-assassin",
   "artist": "Ori Toledano",
   "genres": [
    "Cinematic"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 26,
   "audio": "https://cdn.snowstar.company/audio/5784389055152128.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/ninja-assassin.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "NO LONGER NEED HELP",
   "slug": "no-longer-need-help",
   "artist": "Ori Toledano",
   "genres": [
    "Hip Hop",
    "House & Techno"
   ],
   "packages": [],
   "duration": 289,
   "audio": "https://cdn.snowstar.company/audio/5863553892352000.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/no-longer-need-help.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 133,
   "vocal": "Vocals",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "NO LONGER NEED HELP (PLAYBACK)",
   "slug": "no-longer-need-help-playback",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Ambient"
   ],
   "packages": [],
   "duration": 291,
   "audio": "https://cdn.snowstar.company/audio-src/no-longer-need-help-playback.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/no-longer-need-help-playback.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Instrumental",
    "Piano",
    "Synth"
   ],
   "bpm": 133,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "NOBODY KNOWS NOTHING ANYWHERE",
   "slug": "nobody-knows-nothing-anywhere",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [
    "Selected",
    "Shilton Haztlalim"
   ],
   "duration": 210,
   "audio": "https://cdn.snowstar.company/audio/6645893526716416.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/nobody-knows-nothing-anywhere.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 106,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "NORMALITY",
   "slug": "normality",
   "artist": "Ori Toledano",
   "genres": [
    "World",
    "Ambient"
   ],
   "packages": [
    "Shilton Haztlalim"
   ],
   "duration": 77,
   "audio": "https://cdn.snowstar.company/audio/4541064297840640.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/normality.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental"
   ],
   "bpm": 124,
   "vocal": "Instrumental",
   "key": "C#",
   "scale": "major"
  },
  {
   "title": "NORTH PULSES",
   "slug": "north-pulses",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 236,
   "audio": "https://cdn.snowstar.company/audio-src/north-pulses.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/north-pulses.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 126,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "OFF THE GRID",
   "slug": "off-the-grid",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Indie"
   ],
   "packages": [],
   "duration": 195,
   "audio": "https://cdn.snowstar.company/audio/5617263287730176.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/off-the-grid.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 100,
   "vocal": "Vocals",
   "key": "C#",
   "scale": "minor"
  },
  {
   "title": "OFF THE GRID (PLAYBACK)",
   "slug": "off-the-grid-playback",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 195,
   "audio": "https://cdn.snowstar.company/audio-src/off-the-grid-playback.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/off-the-grid-playback.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 100,
   "vocal": "Instrumental",
   "key": "C#",
   "scale": "minor"
  },
  {
   "title": "OK AT THE STATION",
   "slug": "ok-at-the-station",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Vintage"
   ],
   "duration": 125,
   "audio": "https://cdn.snowstar.company/audio/5659722193567744.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/ok-at-the-station.jpg",
   "moods": [
    "Happy",
    "Uplifting"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 134,
   "vocal": "Vocals",
   "key": "G",
   "scale": "major"
  },
  {
   "title": "OK AT THE STATION (PLAYBACK)",
   "slug": "ok-at-the-station-playback",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Vintage"
   ],
   "duration": 125,
   "audio": "https://cdn.snowstar.company/audio/4533822286725120.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/ok-at-the-station-playback.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 134,
   "vocal": "Vocals",
   "key": "G",
   "scale": "major"
  },
  {
   "title": "OLD BROADWAY",
   "slug": "old-broadway",
   "artist": "Ori Toledano",
   "genres": [
    "Jazz & Blues"
   ],
   "packages": [],
   "duration": 55,
   "audio": "https://cdn.snowstar.company/audio/5731612497018880.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/old-broadway.jpg",
   "moods": [
    "Uplifting",
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 90,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "ONE DAY TALE (BUZA)",
   "slug": "one-day-tale-buza",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "Ambient"
   ],
   "packages": [],
   "duration": 168,
   "audio": "https://cdn.snowstar.company/audio/4676081334353920.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/one-day-tale-buza.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental"
   ],
   "bpm": 162,
   "vocal": "Instrumental",
   "key": "Ab",
   "scale": "major"
  },
  {
   "title": "OPHELIA'S DOUBT",
   "slug": "ophelia-s-doubt",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Electronic"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 101,
   "audio": "https://cdn.snowstar.company/audio/5851513555517440.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/ophelia-s-doubt.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Piano"
   ],
   "bpm": 150,
   "vocal": "Instrumental",
   "key": "Bb",
   "scale": "major"
  },
  {
   "title": "OUZO",
   "slug": "ouzo",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 210,
   "audio": "https://cdn.snowstar.company/audio/4528491561222144.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/ouzo.jpg",
   "moods": [
    "Party",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 114,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "OWLS",
   "slug": "owls",
   "artist": "Ori Toledano",
   "genres": [
    "Hip Hop",
    "Trap"
   ],
   "packages": [],
   "duration": 44,
   "audio": "https://cdn.snowstar.company/audio-src/owls.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/owls.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 125,
   "vocal": "Vocals",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "PADDY EAST WIND",
   "slug": "paddy-east-wind",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [],
   "duration": 176,
   "audio": "https://cdn.snowstar.company/audio-src/paddy-east-wind.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/paddy-east-wind.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 79,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "PAM PAM PAM",
   "slug": "pam-pam-pam",
   "artist": "Ori Toledano",
   "genres": [
    "Cinematic",
    "Jazz & Blues"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 6,
   "audio": "https://cdn.snowstar.company/audio/5300603938930688.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pam-pam-pam.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 150,
   "vocal": "Instrumental",
   "key": "F#",
   "scale": "major"
  },
  {
   "title": "PASHUT",
   "slug": "pashut",
   "artist": "Ori Toledano",
   "genres": [
    "Funk & Soul",
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 146,
   "audio": "https://cdn.snowstar.company/audio/6382523380662272.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pashut.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 96,
   "vocal": "Vocals",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "PATRICIA",
   "slug": "patricia",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 209,
   "audio": "https://cdn.snowstar.company/audio/5320139933220864.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/patricia.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 116,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "PEPPER - ALERT",
   "slug": "pepper-alert",
   "artist": "Ori Toledano",
   "genres": [
    "SFX"
   ],
   "packages": [
    "PEPPER IN-APP SFX"
   ],
   "duration": 2,
   "audio": "https://cdn.snowstar.company/audio/5312963378413568.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pepper-alert.jpg",
   "moods": [],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 126,
   "vocal": "Instrumental"
  },
  {
   "title": "PEPPER - CONFETTI",
   "slug": "pepper-confetti",
   "artist": "Ori Toledano",
   "genres": [
    "SFX"
   ],
   "packages": [
    "PEPPER IN-APP SFX"
   ],
   "duration": 10,
   "audio": "https://cdn.snowstar.company/audio/5875913331834880.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pepper-confetti.jpg",
   "moods": [],
   "instruments": [
    "Vocals"
   ],
   "bpm": 121,
   "vocal": "Vocals",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "PEPPER - GIF (2 PARTS)",
   "slug": "pepper-gif-2-parts",
   "artist": "Ori Toledano",
   "genres": [
    "SFX"
   ],
   "packages": [
    "PEPPER IN-APP SFX"
   ],
   "duration": 3,
   "audio": "https://cdn.snowstar.company/audio/4750013424992256.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pepper-gif-2-parts.jpg",
   "moods": [],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 115,
   "vocal": "Instrumental",
   "key": "Eb",
   "scale": "minor"
  },
  {
   "title": "PEPPER - GIF (PART 1)",
   "slug": "pepper-gif-part-1",
   "artist": "Ori Toledano",
   "genres": [
    "SFX"
   ],
   "packages": [
    "PEPPER IN-APP SFX"
   ],
   "duration": 1,
   "audio": "https://cdn.snowstar.company/audio/6579600773611520.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pepper-gif-part-1.jpg",
   "moods": [],
   "instruments": []
  },
  {
   "title": "PEPPER - GIF (PART 2)",
   "slug": "pepper-gif-part-2",
   "artist": "Ori Toledano",
   "genres": [
    "SFX"
   ],
   "packages": [
    "PEPPER IN-APP SFX"
   ],
   "duration": 1,
   "audio": "https://cdn.snowstar.company/audio/5453700866768896.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pepper-gif-part-2.jpg",
   "moods": [],
   "instruments": []
  },
  {
   "title": "PEPPER - MAIN (MONEY IN)",
   "slug": "pepper-main-money-in",
   "artist": "Ori Toledano",
   "genres": [
    "SFX"
   ],
   "packages": [
    "PEPPER IN-APP SFX"
   ],
   "duration": 4,
   "audio": "https://cdn.snowstar.company/audio/6016650820190208.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pepper-main-money-in.jpg",
   "moods": [],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 114,
   "vocal": "Instrumental",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "PEPPER - RECEIVED",
   "slug": "pepper-received",
   "artist": "Ori Toledano",
   "genres": [
    "SFX"
   ],
   "packages": [
    "PEPPER IN-APP SFX"
   ],
   "duration": 1,
   "audio": "https://cdn.snowstar.company/audio/4890750913347584.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pepper-received.jpg",
   "moods": [],
   "instruments": []
  },
  {
   "title": "PEPPER - REGULAR (PUSH)",
   "slug": "pepper-regular-push",
   "artist": "Ori Toledano",
   "genres": [
    "SFX"
   ],
   "packages": [
    "PEPPER IN-APP SFX"
   ],
   "duration": 4,
   "audio": "https://cdn.snowstar.company/audio/6298125796900864.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pepper-regular-push.jpg",
   "moods": [],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 115,
   "vocal": "Instrumental",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "PEPPER - SENT",
   "slug": "pepper-sent",
   "artist": "Ori Toledano",
   "genres": [
    "SFX"
   ],
   "packages": [
    "PEPPER IN-APP SFX"
   ],
   "duration": 1,
   "audio": "https://cdn.snowstar.company/audio/5172225890058240.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pepper-sent.jpg",
   "moods": [],
   "instruments": []
  },
  {
   "title": "PEPPER - STARS",
   "slug": "pepper-stars",
   "artist": "Ori Toledano",
   "genres": [
    "SFX"
   ],
   "packages": [
    "PEPPER IN-APP SFX"
   ],
   "duration": 5,
   "audio": "https://cdn.snowstar.company/audio/5735175843479552.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pepper-stars.jpg",
   "moods": [],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 111,
   "vocal": "Instrumental",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "PEPPER ANTHEM",
   "slug": "pepper-anthem",
   "artist": "Ori Toledano",
   "genres": [
    "SFX"
   ],
   "packages": [
    "PEPPER IN-APP SFX"
   ],
   "duration": 139,
   "audio": "https://cdn.snowstar.company/audio/5552906877009920.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pepper-anthem.jpg",
   "moods": [],
   "instruments": [
    "Vocals"
   ],
   "bpm": 126,
   "vocal": "Vocals",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "PETITE MARIONETTE",
   "slug": "petite-marionette",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "Dance"
   ],
   "packages": [],
   "duration": 82,
   "audio": "https://cdn.snowstar.company/audio/5291807845908480.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/petite-marionette.jpg",
   "moods": [
    "Uplifting",
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 96,
   "vocal": "Instrumental",
   "key": "Eb",
   "scale": "major"
  },
  {
   "title": "PIECES OF A WHOLE",
   "slug": "pieces-of-a-whole",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 30,
   "audio": "https://cdn.snowstar.company/audio/6393627011973120.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pieces-of-a-whole.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Piano",
    "Vocals"
   ],
   "bpm": 125,
   "vocal": "Vocals",
   "key": "C#",
   "scale": "major"
  },
  {
   "title": "PINK TRAP",
   "slug": "pink-trap",
   "artist": "Ori Toledano",
   "genres": [
    "Hip Hop"
   ],
   "packages": [],
   "duration": 54,
   "audio": "https://cdn.snowstar.company/audio/5309400031952896.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pink-trap.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 150,
   "vocal": "Vocals",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "PIZZI DARK COMIC",
   "slug": "pizzi-dark-comic",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Cinematic"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 26,
   "audio": "https://cdn.snowstar.company/audio/6434787294183424.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pizzi-dark-comic.jpg",
   "moods": [
    "Dramatic",
    "Dark",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 113,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "POP ROCK UNDER",
   "slug": "pop-rock-under",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Dance"
   ],
   "packages": [],
   "duration": 21,
   "audio": "https://cdn.snowstar.company/audio/5221439101730816.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pop-rock-under.jpg",
   "moods": [
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Instrumental"
   ],
   "bpm": 97,
   "vocal": "Instrumental",
   "key": "Eb",
   "scale": "major"
  },
  {
   "title": "POSITIVE HAPPY FOLK",
   "slug": "positive-happy-folk",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "Dance"
   ],
   "packages": [],
   "duration": 46,
   "audio": "https://cdn.snowstar.company/audio/6347339008573440.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/positive-happy-folk.jpg",
   "moods": [
    "Uplifting",
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Instrumental"
   ],
   "bpm": 100,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "major"
  },
  {
   "title": "POSITIVE INTIMATE DRIFT",
   "slug": "positive-intimate-drift",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 34,
   "audio": "https://cdn.snowstar.company/audio/5582078915641344.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/positive-intimate-drift.jpg",
   "moods": [
    "Romantic",
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental"
   ],
   "bpm": 136,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "POWER TO GO ON",
   "slug": "power-to-go-on",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Pop"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 268,
   "audio": "https://cdn.snowstar.company/audio/6017490956058624.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/power-to-go-on.jpg",
   "moods": [
    "Party",
    "Playful"
   ],
   "instruments": [
    "Synth",
    "Vocals"
   ],
   "bpm": 126,
   "vocal": "Vocals",
   "key": "C#",
   "scale": "minor"
  },
  {
   "title": "PRAY",
   "slug": "pray",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "Electronic"
   ],
   "packages": [],
   "duration": 170,
   "audio": "https://cdn.snowstar.company/audio/6417707752751104.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/pray.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 100,
   "vocal": "Instrumental",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "PRECIOUS LOVE",
   "slug": "precious-love",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 330,
   "audio": "https://cdn.snowstar.company/audio/5326992217997312.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/precious-love.jpg",
   "moods": [
    "Party",
    "Romantic"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 118,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "PURIFIED",
   "slug": "purified",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 8,
   "audio": "https://cdn.snowstar.company/audio/6476568736038912.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/purified.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 162,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "R U MINE (DUBSTEP REMIX)",
   "slug": "r-u-mine-dubstep-remix",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Ambient"
   ],
   "packages": [],
   "duration": 267,
   "audio": "https://cdn.snowstar.company/audio/4939964125020160.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/r-u-mine-dubstep-remix.jpg",
   "moods": [
    "Epic",
    "Party"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 97,
   "vocal": "Instrumental",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "RABELS",
   "slug": "rabels",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 63,
   "audio": "https://cdn.snowstar.company/audio/6364418550005760.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/rabels.jpg",
   "moods": [
    "Aggressive"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 76,
   "vocal": "Vocals",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "RAINBOW DISCO",
   "slug": "rainbow-disco",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 105,
   "audio": "https://cdn.snowstar.company/audio/6065864031862784.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/rainbow-disco.jpg",
   "moods": [
    "Playful"
   ],
   "instruments": [
    "Guitar",
    "Instrumental"
   ],
   "bpm": 114,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "REAL FEEL (BLEND 08)",
   "slug": "real-feel-blend-08",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "Dance Pop"
   ],
   "duration": 261,
   "audio": "https://cdn.snowstar.company/audio/6580440909479936.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/real-feel-blend-08.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 124,
   "vocal": "Instrumental",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "REBORN",
   "slug": "reborn",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "House & Beyond"
   ],
   "duration": 334,
   "audio": "https://cdn.snowstar.company/audio/4549208369528832.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/reborn.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "REVENGENCE",
   "slug": "revengence",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Classical"
   ],
   "packages": [],
   "duration": 126,
   "audio": "https://cdn.snowstar.company/audio/6743163194572800.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/revengence.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "ROCK TENSION",
   "slug": "rock-tension",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Electronic"
   ],
   "packages": [],
   "duration": 38,
   "audio": "https://cdn.snowstar.company/audio/5406157055197184.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/rock-tension.jpg",
   "moods": [
    "Tense"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 85,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "ROCK'N'ROLL",
   "slug": "rock-n-roll",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Funk & Soul"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 23,
   "audio": "https://cdn.snowstar.company/audio/6223681061650432.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/rock-n-roll.jpg",
   "moods": [
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 117,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "ROCK'N'ROLL SURF",
   "slug": "rock-n-roll-surf",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 31,
   "audio": "https://cdn.snowstar.company/audio/4816306178097152.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/rock-n-roll-surf.jpg",
   "moods": [
    "Happy"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 149,
   "vocal": "Vocals",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "ROUTE DE L'AMOUR",
   "slug": "route-de-l-amour",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Dance"
   ],
   "packages": [],
   "duration": 237,
   "audio": "https://cdn.snowstar.company/audio/5819573427240960.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/route-de-l-amour.jpg",
   "moods": [
    "Party",
    "Playful",
    "Romantic"
   ],
   "instruments": [
    "Synth",
    "Vocals"
   ],
   "bpm": 124,
   "vocal": "Vocals",
   "key": "C#",
   "scale": "minor"
  },
  {
   "title": "ROUTE DE L'AMOUR (LONG EDIT)",
   "slug": "route-de-l-amour-2",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "House & Beyond"
   ],
   "duration": 333,
   "audio": "https://cdn.snowstar.company/audio/5675108276371456.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/route-de-l-amour-2.jpg",
   "moods": [
    "Party",
    "Romantic"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 124,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "RUBI",
   "slug": "rubi",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 248,
   "audio": "https://cdn.snowstar.company/audio/5010332869197824.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/rubi.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 96,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "minor"
  },
  {
   "title": "SAD GAMEBOY",
   "slug": "sad-gameboy",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic"
   ],
   "packages": [
    "Electronica"
   ],
   "duration": 136,
   "audio": "https://cdn.snowstar.company/audio/5326479573385216.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/sad-gameboy.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 145,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "SAME",
   "slug": "same",
   "artist": "Ori Toledano",
   "genres": [
    "Funk & Soul"
   ],
   "packages": [],
   "duration": 189,
   "audio": "https://cdn.snowstar.company/audio/6136232776040448.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/same.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Synth",
    "Vocals"
   ],
   "bpm": 104,
   "vocal": "Vocals",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "SECOND HAND (PLAYBACK)",
   "slug": "second-hand-playback",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 49,
   "audio": "https://cdn.snowstar.company/audio/4787718875774976.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/second-hand-playback.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 110,
   "vocal": "Instrumental",
   "key": "Bb",
   "scale": "major"
  },
  {
   "title": "SECOND HAND - NO MELODY",
   "slug": "second-hand-no-melody",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 95,
   "audio": "https://cdn.snowstar.company/audio-src/second-hand-no-melody.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/second-hand-no-melody.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 110,
   "vocal": "Instrumental",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "SHADING TO GREY",
   "slug": "shading-to-grey",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "Electronica"
   ],
   "duration": 250,
   "audio": "https://cdn.snowstar.company/audio/4904267108319232.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/shading-to-grey.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Synth",
    "Vocals"
   ],
   "bpm": 126,
   "vocal": "Vocals",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "SHADING TO PHRASE",
   "slug": "shading-to-phrase",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Electronic"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 145,
   "audio": "https://cdn.snowstar.company/audio/5654391468064768.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/shading-to-phrase.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 126,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "major"
  },
  {
   "title": "SHADY TALK PULSE",
   "slug": "shady-talk-pulse",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [
    "Shilton Haztlalim"
   ],
   "duration": 86,
   "audio": "https://cdn.snowstar.company/audio/5871837340762112.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/shady-talk-pulse.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 112,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "SHALOM ALECHEM (RED ARMY STYLE)",
   "slug": "shalom-alechem-red-army-style",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [],
   "duration": 10,
   "audio": "https://cdn.snowstar.company/audio/5889942171418624.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/shalom-alechem-red-army-style.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Choir",
    "Vocals"
   ],
   "bpm": 129,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "SHIFTING GEARS",
   "slug": "shifting-gears",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 69,
   "audio": "https://cdn.snowstar.company/audio-src/shifting-gears.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/shifting-gears.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 94,
   "vocal": "Vocals",
   "key": "C#",
   "scale": "minor"
  },
  {
   "title": "SHITTY WORMS",
   "slug": "shitty-worms",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 172,
   "audio": "https://cdn.snowstar.company/audio/4887187566886912.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/shitty-worms.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 115,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "SHORDITCH 14",
   "slug": "shorditch-14",
   "artist": "Ori Toledano",
   "genres": [
    "Funk & Soul"
   ],
   "packages": [],
   "duration": 120,
   "audio": "https://cdn.snowstar.company/audio/6416270347993088.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/shorditch-14.jpg",
   "moods": [
    "Party",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 108,
   "vocal": "Vocals",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "SHORDITCH 14 (VER 2)",
   "slug": "shorditch-14-2",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "Dance"
   ],
   "packages": [],
   "duration": 44,
   "audio": "https://cdn.snowstar.company/audio-src/shorditch-14-2.m4a",
   "cover": "https://cdn.snowstar.company/covers-art-sm/shorditch-14-2.jpg",
   "moods": [
    "Party",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 108,
   "vocal": "Vocals",
   "key": "F",
   "scale": "minor"
  },
  {
   "title": "SIMPLE COUNTRY FOLK GUITAR WHISTLE",
   "slug": "simple-country-folk-guitar-whistle",
   "artist": "Ori Toledano",
   "genres": [
    "Folk & Acoustic",
    "Jazz & Blues"
   ],
   "packages": [],
   "duration": 32,
   "audio": "https://cdn.snowstar.company/audio/6285766357417984.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/simple-country-folk-guitar-whistle.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental"
   ],
   "bpm": 97,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "major"
  },
  {
   "title": "SIMPLE THINGS",
   "slug": "simple-things",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Indie"
   ],
   "packages": [],
   "duration": 66,
   "audio": "https://cdn.snowstar.company/audio/4764042264576000.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/simple-things.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Instrumental",
    "Piano"
   ],
   "bpm": 80,
   "vocal": "Instrumental",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "SLOW SMOOTH JAZZ",
   "slug": "slow-smooth-jazz",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "Jazz & Blues"
   ],
   "packages": [
    "Vintage"
   ],
   "duration": 145,
   "audio": "https://cdn.snowstar.company/audio/4815297263435776.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/slow-smooth-jazz.jpg",
   "moods": [
    "Romantic",
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano"
   ],
   "bpm": 74,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "SOFT ORCHESTRAL STING",
   "slug": "soft-orchestral-sting",
   "artist": "Ori Toledano",
   "genres": [
    "Jazz & Blues",
    "Cinematic"
   ],
   "packages": [
    "Advertising Essentials",
    "Orchestral Collection Vol. 01"
   ],
   "duration": 8,
   "audio": "https://cdn.snowstar.company/audio/4646981387419648.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/soft-orchestral-sting.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 118,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "SOMEBODY ELSE (GLITCH MIX)",
   "slug": "somebody-else-glitch-mix",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 203,
   "audio": "https://cdn.snowstar.company/audio/4552936032043008.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/somebody-else-glitch-mix.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 118,
   "vocal": "Vocals",
   "key": "C#",
   "scale": "minor"
  },
  {
   "title": "SOMEBODY ELSE (TRIBAL)",
   "slug": "somebody-else-tribal",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 72,
   "audio": "https://cdn.snowstar.company/audio/5379256131518464.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/somebody-else-tribal.jpg",
   "moods": [
    "Aggressive",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 120,
   "vocal": "Vocals",
   "key": "C#",
   "scale": "minor"
  },
  {
   "title": "SOMEWHERE IN THE MIDDLE",
   "slug": "somewhere-in-the-middle",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Indie"
   ],
   "packages": [
    "Shilton Haztlalim"
   ],
   "duration": 40,
   "audio": "https://cdn.snowstar.company/audio/4605199945564160.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/somewhere-in-the-middle.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental"
   ],
   "bpm": 112,
   "vocal": "Instrumental",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "SORROW",
   "slug": "sorrow",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic"
   ],
   "packages": [],
   "duration": 146,
   "audio": "https://cdn.snowstar.company/audio/6593629613195264.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/sorrow.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "SPACE LOTUS",
   "slug": "space-lotus",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Electronic"
   ],
   "packages": [
    "Electronica"
   ],
   "duration": 96,
   "audio": "https://cdn.snowstar.company/audio/6030167015161856.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/space-lotus.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 117,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "SPANISH TARANTULA",
   "slug": "spanish-tarantula",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 51,
   "audio": "https://cdn.snowstar.company/audio/6153824962084864.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/spanish-tarantula.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Guitar",
    "Instrumental"
   ],
   "bpm": 118,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "SPOOKY TALK",
   "slug": "spooky-talk",
   "artist": "Ori Toledano",
   "genres": [
    "Classical",
    "Ambient"
   ],
   "packages": [],
   "duration": 72,
   "audio": "https://cdn.snowstar.company/audio/5132965526896640.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/spooky-talk.jpg",
   "moods": [
    "Dramatic",
    "Dark",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 117,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "STREAM OF LOVE",
   "slug": "stream-of-love",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 31,
   "audio": "https://cdn.snowstar.company/audio/5467729706352640.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/stream-of-love.jpg",
   "moods": [
    "Uplifting",
    "Romantic",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 142,
   "vocal": "Vocals",
   "key": "Bb",
   "scale": "major"
  },
  {
   "title": "STREAM OF LOVE (PLAYBACK)",
   "slug": "stream-of-love-playback",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 31,
   "audio": "https://cdn.snowstar.company/audio/4878391473864704.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/stream-of-love-playback.jpg",
   "moods": [
    "Playful",
    "Romantic"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 142,
   "vocal": "Vocals",
   "key": "Bb",
   "scale": "minor"
  },
  {
   "title": "STRINGFIELD",
   "slug": "stringfield",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Chill / Lo-Fi"
   ],
   "packages": [],
   "duration": 110,
   "audio": "https://cdn.snowstar.company/audio/5433353157214208.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/stringfield.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 105,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "STRINGFIELD - MINIMAL",
   "slug": "stringfield-minimal",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Chill / Lo-Fi"
   ],
   "packages": [
    "Selected"
   ],
   "duration": 187,
   "audio": "https://cdn.snowstar.company/audio/6712907280678912.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/stringfield-minimal.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Guitar",
    "Instrumental",
    "Synth"
   ],
   "bpm": 105,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "SUGARY SALT MOUNTAIN",
   "slug": "sugary-salt-mountain",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Cinematic"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 117,
   "audio": "https://cdn.snowstar.company/audio/4549691788230656.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/sugary-salt-mountain.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 78,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "SUIT YOURSELF",
   "slug": "suit-yourself",
   "artist": "Ori Toledano",
   "genres": [
    "Pop",
    "Dance"
   ],
   "packages": [],
   "duration": 48,
   "audio": "https://cdn.snowstar.company/audio/6699182729461760.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/suit-yourself.jpg",
   "moods": [
    "Party",
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 119,
   "vocal": "Vocals",
   "key": "Ab",
   "scale": "minor"
  },
  {
   "title": "SUIT YOURSELF (PLAYBACK)",
   "slug": "suit-yourself-playback",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Pop"
   ],
   "packages": [],
   "duration": 48,
   "audio": "https://cdn.snowstar.company/audio/5168662543597568.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/suit-yourself-playback.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 118,
   "vocal": "Vocals",
   "key": "Ab",
   "scale": "minor"
  },
  {
   "title": "SUNNY IS A HOPELESS GIRL",
   "slug": "sunny-is-a-hopeless-girl",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "House & Beyond"
   ],
   "duration": 429,
   "audio": "https://cdn.snowstar.company/audio/5112158322950144.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/sunny-is-a-hopeless-girl.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 118,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "SUPAPLEX",
   "slug": "supaplex",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Selected"
   ],
   "duration": 70,
   "audio": "https://cdn.snowstar.company/audio/5129610536681472.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/supaplex.jpg",
   "moods": [
    "Aggressive",
    "Party",
    "Playful"
   ],
   "instruments": [
    "Synth",
    "Vocals"
   ],
   "bpm": 154,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "SUPERHEROS",
   "slug": "superheros",
   "artist": "Ori Toledano",
   "genres": [
    "Cinematic"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 58,
   "audio": "https://cdn.snowstar.company/audio/5288563602096128.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/superheros.jpg",
   "moods": [
    "Epic"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 132,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "SUPERSIZE BASS",
   "slug": "supersize-bass",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 74,
   "audio": "https://cdn.snowstar.company/audio/6004291380707328.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/supersize-bass.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 116,
   "vocal": "Vocals",
   "key": "F",
   "scale": "minor"
  },
  {
   "title": "TANGIBLE",
   "slug": "tangible",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 157,
   "audio": "https://cdn.snowstar.company/audio/5790387312525312.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/tangible.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Synth",
    "Vocals"
   ],
   "bpm": 110,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "TANGO SHMANGO",
   "slug": "tango-shmango",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 220,
   "audio": "https://cdn.snowstar.company/audio/5008895464439808.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/tango-shmango.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "TASTE OF PASSION (80'S PARODY)",
   "slug": "taste-of-passion-80-s-parody",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 48,
   "audio": "https://cdn.snowstar.company/audio/5607954550095872.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/taste-of-passion-80-s-parody.jpg",
   "moods": [
    "Uplifting",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 152,
   "vocal": "Vocals",
   "key": "G",
   "scale": "major"
  },
  {
   "title": "TECH E FASHION",
   "slug": "tech-e-fashion",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "House & Techno"
   ],
   "packages": [],
   "duration": 66,
   "audio": "https://cdn.snowstar.company/audio/6294562450440192.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/tech-e-fashion.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 108,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "TELENOVELLA (FULL)",
   "slug": "telenovella-full",
   "artist": "Ori Toledano",
   "genres": [
    "Classical",
    "Cinematic"
   ],
   "packages": [],
   "duration": 27,
   "audio": "https://cdn.snowstar.company/audio/6567241334128640.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/telenovella-full.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano"
   ],
   "bpm": 145,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "TELENOVELLA (PIANO)",
   "slug": "telenovella-piano",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [],
   "duration": 27,
   "audio": "https://cdn.snowstar.company/audio/4737653985509376.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/telenovella-piano.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano"
   ],
   "bpm": 147,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "THE ARRIVAL",
   "slug": "the-arrival",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "Ambient"
   ],
   "packages": [
    "Electronica"
   ],
   "duration": 153,
   "audio": "https://cdn.snowstar.company/audio/6663485712760832.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-arrival.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 70,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "THE DEVIOUS FOX",
   "slug": "the-devious-fox",
   "artist": "Ori Toledano",
   "genres": [
    "Funk & Soul",
    "Chill / Lo-Fi"
   ],
   "packages": [
    "Selected",
    "Shilton Haztlalim"
   ],
   "duration": 144,
   "audio": "https://cdn.snowstar.company/audio/5977390457028608.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-devious-fox.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Instrumental"
   ],
   "bpm": 100,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "THE FREAK FUNK SHOW - FULL",
   "slug": "the-freak-funk-show-full",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Chill / Lo-Fi"
   ],
   "packages": [
    "Advertising Essentials",
    "Selected"
   ],
   "duration": 39,
   "audio": "https://cdn.snowstar.company/audio/6575524782538752.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-freak-funk-show-full.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 104,
   "vocal": "Vocals",
   "key": "Ab",
   "scale": "minor"
  },
  {
   "title": "THE FREAK SHOW",
   "slug": "the-freak-show",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "Dance"
   ],
   "packages": [
    "Selected"
   ],
   "duration": 27,
   "audio": "https://cdn.snowstar.company/audio/4723631991029760.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-freak-show.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 104,
   "vocal": "Instrumental",
   "key": "Ab",
   "scale": "minor"
  },
  {
   "title": "THE FREAK SHOW - 1",
   "slug": "the-freak-show-1",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "Dance"
   ],
   "packages": [
    "Shilton Haztlalim"
   ],
   "duration": 27,
   "audio": "https://cdn.snowstar.company/audio/4957043666452480.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-freak-show-1.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 104,
   "vocal": "Instrumental",
   "key": "Ab",
   "scale": "minor"
  },
  {
   "title": "THE FREAK SHOW 2",
   "slug": "the-freak-show-2",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Chill / Lo-Fi"
   ],
   "packages": [
    "Shilton Haztlalim"
   ],
   "duration": 39,
   "audio": "https://cdn.snowstar.company/audio/6752293850447872.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-freak-show-2.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 104,
   "vocal": "Vocals",
   "key": "Ab",
   "scale": "minor"
  },
  {
   "title": "THE GREAT KINGDOM",
   "slug": "the-great-kingdom",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Classical"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 53,
   "audio": "https://cdn.snowstar.company/audio/5675591695073280.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-great-kingdom.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano"
   ],
   "bpm": 83,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "THE KISS",
   "slug": "the-kiss",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [],
   "duration": 53,
   "audio": "https://cdn.snowstar.company/audio/5019128962220032.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-kiss.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental",
    "Piano"
   ],
   "bpm": 100,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "THE RACE (INSTRUMENTAL)",
   "slug": "the-race-instrumental",
   "artist": "Ori Toledano",
   "genres": [
    "Rock",
    "Indie"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 281,
   "audio": "https://cdn.snowstar.company/audio/6452379480227840.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-race-instrumental.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental",
    "Piano"
   ],
   "bpm": 85,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "THE RISE AND FALL (LONG VER.)",
   "slug": "the-rise-and-fall-long-ver",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "House & Techno"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 120,
   "audio": "https://cdn.snowstar.company/audio/5265419566841856.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-rise-and-fall-long-ver.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 142,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "THE RISE AND FALL (ORGANIC VER.)",
   "slug": "the-rise-and-fall-organic-ver",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 98,
   "audio": "https://cdn.snowstar.company/audio/4983944590131200.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-rise-and-fall-organic-ver.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Piano"
   ],
   "bpm": 142,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "THE RISE AND FALL (ORIGINAL VER.)",
   "slug": "the-rise-and-fall-original-ver",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "House & Techno"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 98,
   "audio": "https://cdn.snowstar.company/audio/6391319473684480.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-rise-and-fall-original-ver.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 142,
   "vocal": "Vocals",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "THE SAD PIANIST",
   "slug": "the-sad-pianist",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient",
    "Classical"
   ],
   "packages": [],
   "duration": 46,
   "audio": "https://cdn.snowstar.company/audio-src/the-sad-pianist.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-sad-pianist.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano"
   ],
   "bpm": 100,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "THE SECRET GARDEN",
   "slug": "the-secret-garden",
   "artist": "Ori Toledano",
   "genres": [
    "Classical",
    "Cinematic"
   ],
   "packages": [
    "Orchestral Collection Vol. 02"
   ],
   "duration": 87,
   "audio": "https://cdn.snowstar.company/audio/5112641741651968.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-secret-garden.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano",
    "Strings"
   ],
   "bpm": 117,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "THE TERRIBLE TWOS",
   "slug": "the-terrible-twos",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 19,
   "audio": "https://cdn.snowstar.company/audio/4986252128419840.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/the-terrible-twos.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 162,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "major"
  },
  {
   "title": "THEM ALL FEARS",
   "slug": "them-all-fears",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Chill / Lo-Fi"
   ],
   "packages": [
    "Electronica"
   ],
   "duration": 302,
   "audio": "https://cdn.snowstar.company/audio/6311641991872512.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/them-all-fears.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 156,
   "vocal": "Instrumental",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "THIS IS HOW I TRICKED YA",
   "slug": "this-is-how-i-tricked-ya",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Dance"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 61,
   "audio": "https://cdn.snowstar.company/audio-extra/this-is-how-i-tricked-ya.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/this-is-how-i-tricked-ya.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 110,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "major"
  },
  {
   "title": "TIGERS (INSTRUMENTAL)",
   "slug": "tigers-instrumental",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [],
   "duration": 148,
   "audio": "https://cdn.snowstar.company/audio/6399602922094592.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/tigers-instrumental.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano",
    "Synth"
   ],
   "bpm": 148,
   "vocal": "Instrumental",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "TIK TAK TOE (PIANO)",
   "slug": "tik-tak-toe-piano",
   "artist": "Ori Toledano",
   "genres": [
    "Jazz & Blues"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 8,
   "audio": "https://cdn.snowstar.company/audio/4845514640064512.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/tik-tak-toe-piano.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano"
   ],
   "bpm": 118,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "TILL IT'S GONE",
   "slug": "till-it-s-gone",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "House & Beyond"
   ],
   "duration": 433,
   "audio": "https://cdn.snowstar.company/audio/6238058229792768.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/till-it-s-gone.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 122,
   "vocal": "Instrumental",
   "key": "Ab",
   "scale": "major"
  },
  {
   "title": "TOKYO SHAKE",
   "slug": "tokyo-shake",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "Electronica"
   ],
   "duration": 60,
   "audio": "https://cdn.snowstar.company/audio/4622792131608576.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/tokyo-shake.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 128,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "minor"
  },
  {
   "title": "TOO MUCH OF EVERYTHING",
   "slug": "too-much-of-everything",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Ambient"
   ],
   "packages": [],
   "duration": 182,
   "audio": "https://cdn.snowstar.company/audio/5573282822619136.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/too-much-of-everything.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Guitar",
    "Instrumental",
    "Piano"
   ],
   "bpm": 100,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "TRAIN IS ON",
   "slug": "train-is-on",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "House & Techno"
   ],
   "packages": [],
   "duration": 221,
   "audio": "https://cdn.snowstar.company/audio/5256623473819648.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/train-is-on.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Vocals"
   ],
   "bpm": 100,
   "vocal": "Vocals",
   "key": "E",
   "scale": "major"
  },
  {
   "title": "TRAP LESS",
   "slug": "boston-shake",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Hip Hop"
   ],
   "packages": [],
   "duration": 109,
   "audio": "https://cdn.snowstar.company/audio/4667285241331712.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/boston-shake.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Synth",
    "Vocals"
   ],
   "bpm": 90,
   "vocal": "Vocals",
   "key": "E",
   "scale": "major"
  },
  {
   "title": "TRAP MASS",
   "slug": "trap-mass",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 104,
   "audio": "https://cdn.snowstar.company/audio/6707978822483968.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/trap-mass.jpg",
   "moods": [
    "Aggressive",
    "Party"
   ],
   "instruments": [
    "Synth",
    "Vocals"
   ],
   "bpm": 90,
   "vocal": "Vocals",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "TRUMP",
   "slug": "trump",
   "artist": "Ori Toledano",
   "genres": [
    "Dance",
    "Rock"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 186,
   "audio": "https://cdn.snowstar.company/audio/6170904503517184.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/trump.jpg",
   "moods": [
    "Aggressive"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 120,
   "vocal": "Vocals",
   "key": "C#",
   "scale": "major"
  },
  {
   "title": "TV SHOW INTRO (SKA ROCK)",
   "slug": "tv-show-intro-ska-rock",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Epic Rock"
   ],
   "duration": 18,
   "audio": "https://cdn.snowstar.company/audio/4534831201386496.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/tv-show-intro-ska-rock.jpg",
   "moods": [
    "Aggressive",
    "Happy"
   ],
   "instruments": [
    "Guitar",
    "Vocals"
   ],
   "bpm": 104,
   "vocal": "Vocals",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "UNBAN THAT SHIT",
   "slug": "unban-that-shit",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Rock"
   ],
   "duration": 245,
   "audio": "https://cdn.snowstar.company/audio/5045004596674560.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/unban-that-shit.jpg",
   "moods": [
    "Aggressive",
    "Happy"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 150,
   "vocal": "Vocals",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "VICIOUS HEART",
   "slug": "vicious-heart",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [
    "House & Beyond"
   ],
   "duration": 416,
   "audio": "https://cdn.snowstar.company/audio/4830683346239488.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/vicious-heart.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 120,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "major"
  },
  {
   "title": "VINTAGE BERLIN TECHNO",
   "slug": "vintage-berlin-techno",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "House & Beyond"
   ],
   "duration": 172,
   "audio": "https://cdn.snowstar.company/audio/5956583253082112.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/vintage-berlin-techno.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 110,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "VINTAGE UPLIFTING ADVENTURE",
   "slug": "vintage-uplifting-adventure",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [
    "Vintage"
   ],
   "duration": 166,
   "audio": "https://cdn.snowstar.company/audio/5378247216857088.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/vintage-uplifting-adventure.jpg",
   "moods": [
    "Happy",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 129,
   "vocal": "Vocals",
   "key": "Bb",
   "scale": "major"
  },
  {
   "title": "WAR AND THE TOLL",
   "slug": "war-and-the-toll",
   "artist": "Ori Toledano",
   "genres": [
    "Classical"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 62,
   "audio": "https://cdn.snowstar.company/audio/5971414546907136.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/war-and-the-toll.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Piano"
   ],
   "bpm": 123,
   "vocal": "Instrumental",
   "key": "E",
   "scale": "minor"
  },
  {
   "title": "WESTERN MOBY KICK",
   "slug": "western-moby-kick",
   "artist": "Ori Toledano",
   "genres": [
    "Rock"
   ],
   "packages": [],
   "duration": 139,
   "audio": "https://cdn.snowstar.company/audio/5687632031907840.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/western-moby-kick.jpg",
   "moods": [
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 148,
   "vocal": "Vocals",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "WHAT IF IT'S REAL",
   "slug": "what-if-it-s-real",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [
    "Electronica"
   ],
   "duration": 178,
   "audio": "https://cdn.snowstar.company/audio/5537585805918208.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/what-if-it-s-real.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 130,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "WHOOPSY DOOPS",
   "slug": "whoopsy-doops",
   "artist": "Ori Toledano",
   "genres": [
    "Jazz & Blues"
   ],
   "packages": [
    "Selected"
   ],
   "duration": 79,
   "audio": "https://cdn.snowstar.company/audio/5692560490102784.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/whoopsy-doops.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 96,
   "vocal": "Instrumental",
   "key": "D",
   "scale": "minor"
  },
  {
   "title": "WIERD TO RAGE + DIST BEAT",
   "slug": "wierd-to-rage-dist-beat",
   "artist": "Ori Toledano",
   "genres": [
    "Ambient"
   ],
   "packages": [],
   "duration": 62,
   "audio": "https://cdn.snowstar.company/audio/5308887387340800.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/wierd-to-rage-dist-beat.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 111,
   "vocal": "Instrumental",
   "key": "F",
   "scale": "major"
  },
  {
   "title": "WORLD STING",
   "slug": "world-sting",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Ambient"
   ],
   "packages": [
    "Advertising Essentials"
   ],
   "duration": 8,
   "audio": "https://cdn.snowstar.company/audio/5772881294262272.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/world-sting.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 88,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "WOW",
   "slug": "wow",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [],
   "duration": 99,
   "audio": "https://cdn.snowstar.company/audio/4561732125065216.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/wow.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Synth",
    "Vocals"
   ],
   "bpm": 81,
   "vocal": "Vocals",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "XMAS CLARINET",
   "slug": "xmas-clarinet",
   "artist": "Ori Toledano",
   "genres": [
    "Holiday"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 12,
   "audio": "https://cdn.snowstar.company/audio/5689939570196480.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/xmas-clarinet.jpg",
   "moods": [
    "Chill",
    "Sad"
   ],
   "instruments": [
    "Flute",
    "Instrumental",
    "Piano",
    "Strings"
   ],
   "bpm": 139,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "XMAS CLARINET (SLOW)",
   "slug": "xmas-clarinet-slow",
   "artist": "Ori Toledano",
   "genres": [
    "Holiday",
    "Classical"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 14,
   "audio": "https://cdn.snowstar.company/audio/5408464593485824.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/xmas-clarinet-slow.jpg",
   "moods": [
    "Dramatic",
    "Sad"
   ],
   "instruments": [
    "Instrumental",
    "Strings"
   ],
   "bpm": 121,
   "vocal": "Instrumental",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "XMAS DANCE",
   "slug": "xmas-dance",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Holiday"
   ],
   "packages": [
    "Orchestral Collection Vol. 01"
   ],
   "duration": 13,
   "audio": "https://cdn.snowstar.company/audio/6534364500328448.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/xmas-dance.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 112,
   "vocal": "Vocals",
   "key": "C",
   "scale": "major"
  },
  {
   "title": "YO KA YAY",
   "slug": "yo-ka-yay",
   "artist": "Ori Toledano",
   "genres": [
    "Folk & Acoustic",
    "World"
   ],
   "packages": [],
   "duration": 20,
   "audio": "https://cdn.snowstar.company/audio/5450137520308224.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/yo-ka-yay.jpg",
   "moods": [
    "Uplifting",
    "Chill"
   ],
   "instruments": [
    "Instrumental"
   ],
   "bpm": 144,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "major"
  },
  {
   "title": "YOU ALREADY KNOW",
   "slug": "you-already-know",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 417,
   "audio": "https://cdn.snowstar.company/audio/5643651566796800.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/you-already-know.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Vocals"
   ],
   "bpm": 126,
   "vocal": "Vocals",
   "key": "G",
   "scale": "minor"
  },
  {
   "title": "YOUNGSTERS",
   "slug": "youngsters",
   "artist": "Ori Toledano",
   "genres": [
    "Chill / Lo-Fi",
    "House & Techno"
   ],
   "packages": [],
   "duration": 16,
   "audio": "https://cdn.snowstar.company/audio/5441341427286016.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/youngsters.jpg",
   "moods": [
    "Party",
    "Playful"
   ],
   "instruments": [
    "Drums",
    "Instrumental"
   ],
   "bpm": 106,
   "vocal": "Instrumental",
   "key": "B",
   "scale": "major"
  },
  {
   "title": "Z GERMAN",
   "slug": "z-geramn",
   "artist": "Ori Toledano",
   "genres": [
    "Dance"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 187,
   "audio": "https://cdn.snowstar.company/audio-extra/z-geramn.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/z-geramn.jpg",
   "moods": [
    "Chill"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 121,
   "vocal": "Instrumental",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "Z HOUSE",
   "slug": "z-house",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Dance"
   ],
   "packages": [],
   "duration": 183,
   "audio": "https://cdn.snowstar.company/audio/4904779752931328.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/z-house.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 121,
   "vocal": "Instrumental",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "Z JEW",
   "slug": "z-jew",
   "artist": "Ori Toledano",
   "genres": [
    "Electronic",
    "Dance"
   ],
   "packages": [
    "Hipster"
   ],
   "duration": 175,
   "audio": "https://cdn.snowstar.company/audio-extra/z-jew.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/z-jew.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Instrumental",
    "Synth"
   ],
   "bpm": 121,
   "vocal": "Instrumental",
   "key": "F#",
   "scale": "minor"
  },
  {
   "title": "ZE POPCORN",
   "slug": "ze-popcorn",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Dance"
   ],
   "packages": [],
   "duration": 53,
   "audio": "https://cdn.snowstar.company/audio/6312154636484608.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/ze-popcorn.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 112,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "ZE POPCORN (MINIMAL)",
   "slug": "ze-popcorn-minimal",
   "artist": "Ori Toledano",
   "genres": [
    "House & Techno",
    "Dance"
   ],
   "packages": [],
   "duration": 53,
   "audio": "https://cdn.snowstar.company/audio/4992228038541312.mp3",
   "cover": "https://cdn.snowstar.company/covers-art-sm/ze-popcorn-minimal.jpg",
   "moods": [
    "Party"
   ],
   "instruments": [
    "Drums",
    "Instrumental",
    "Synth"
   ],
   "bpm": 112,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
  {
   "title": "ONSITELOVER",
   "slug": "onsitelover",
   "artist": "KAYMA",
   "genres": [
    "Indie",
    "Pop"
   ],
   "packages": [],
   "duration": 182,
   "audio": "https://cdn.snowstar.company/audio-extra/onsitelover.m4a",
   "cover": "https://cdn.snowstar.company/covers-art-sm/onsitelover.jpg",
   "moods": [
    "Dramatic"
   ],
   "instruments": [
    "Drums",
    "Guitar",
    "Vocals"
   ],
   "bpm": 117,
   "vocal": "Vocals",
   "key": "F#",
   "scale": "minor",
   "lane": "quote"
  },
  {
   "title": "NNPHR",
   "slug": "nnphr",
   "artist": "MatoMer",
   "genres": [
    "House & Techno"
   ],
   "packages": [],
   "duration": 342,
   "audio": "https://cdn.snowstar.company/audio-extra/nnphr.m4a",
   "cover": "https://cdn.snowstar.company/covers-art-sm/nnphr.jpg",
   "moods": [
    "Party",
    "Dark"
   ],
   "instruments": [
    "Drums",
    "Synth"
   ],
   "bpm": 123,
   "vocal": "Instrumental",
   "key": "A",
   "scale": "minor"
  },
 {
  "title": "WOAW",
  "slug": "woaw",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Pop"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 272,
  "audio": "https://cdn.snowstar.company/audio-extra/woaw.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/woaw.jpg",
  "moods": [
   "Uplifting",
   "Dreamy"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 92,
  "vocal": "Vocals",
  "key": "F",
  "scale": "major"
 },
 {
  "title": "LEARN TO SAY NO",
  "slug": "learn-to-say-no",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Pop"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 173,
  "audio": "https://cdn.snowstar.company/audio-extra/learn-to-say-no.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/learn-to-say-no.jpg",
  "moods": [
   "Emotional",
   "Dramatic"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 115,
  "vocal": "Vocals",
  "key": "A",
  "scale": "minor"
 },
 {
  "title": "LEARN TO SAY NO (RADIO EDIT)",
  "slug": "learn-to-say-no-radio",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Pop"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 194,
  "audio": "https://cdn.snowstar.company/audio-extra/learn-to-say-no-radio.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/learn-to-say-no-radio.jpg",
  "moods": [
   "Emotional",
   "Dramatic"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 115,
  "vocal": "Vocals",
  "key": "A",
  "scale": "minor"
 },
 {
  "title": "BUNNY",
  "slug": "bunny",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Pop"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 173,
  "audio": "https://cdn.snowstar.company/audio-extra/bunny.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/bunny.jpg",
  "moods": [
   "Playful",
   "Uplifting"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 120,
  "vocal": "Vocals",
  "key": "A",
  "scale": "minor"
 },
 {
  "title": "DISCO",
  "slug": "disco",
  "artist": "KAYMA",
  "genres": [
   "Dance",
   "Indie"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 201,
  "audio": "https://cdn.snowstar.company/audio-extra/disco.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/disco.jpg",
  "moods": [
   "Party",
   "Playful"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 92,
  "vocal": "Vocals",
  "key": "C#",
  "scale": "minor"
 },
 {
  "title": "MAMA",
  "slug": "mama",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Pop"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 236,
  "audio": "https://cdn.snowstar.company/audio-extra/mama.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/mama.jpg",
  "moods": [
   "Emotional",
   "Sad"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 92,
  "vocal": "Vocals",
  "key": "F",
  "scale": "minor"
 },
 {
  "title": "LATELY",
  "slug": "lately",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Pop"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 207,
  "audio": "https://cdn.snowstar.company/audio-extra/lately.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/lately.jpg",
  "moods": [
   "Dreamy",
   "Sad"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 83,
  "vocal": "Vocals",
  "key": "G",
  "scale": "major"
 },
 {
  "title": "BAD BLOOD",
  "slug": "bad-blood",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Pop"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 215,
  "audio": "https://cdn.snowstar.company/audio-extra/bad-blood.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/bad-blood.jpg",
  "moods": [
   "Dark",
   "Dramatic"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 115,
  "vocal": "Vocals",
  "key": "A",
  "scale": "minor"
 },
 {
  "title": "SYMPATHY",
  "slug": "sympathy",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Pop"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 202,
  "audio": "https://cdn.snowstar.company/audio-extra/sympathy.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/sympathy.jpg",
  "moods": [
   "Emotional",
   "Dreamy"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 92,
  "vocal": "Vocals",
  "key": "G",
  "scale": "minor"
 },
 {
  "title": "NEW TRYING OUTS",
  "slug": "new-trying-outs",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Pop"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 179,
  "audio": "https://cdn.snowstar.company/audio-extra/new-trying-outs.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/new-trying-outs.jpg",
  "moods": [
   "Uplifting",
   "Playful"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 123,
  "vocal": "Vocals",
  "key": "A",
  "scale": "minor"
 },
 {
  "title": "BLUE",
  "slug": "blue",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Pop"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 222,
  "audio": "https://cdn.snowstar.company/audio-extra/blue.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/blue.jpg",
  "moods": [
   "Sad",
   "Dreamy"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 99,
  "vocal": "Vocals",
  "key": "G",
  "scale": "minor"
 },
 {
  "title": "HISTORY",
  "slug": "history",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Pop"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 188,
  "audio": "https://cdn.snowstar.company/audio-extra/history.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/history.jpg",
  "moods": [
   "Dramatic",
   "Emotional"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 112,
  "vocal": "Vocals",
  "key": "F",
  "scale": "minor"
 },
 {
  "title": "TIL IT'S OVER",
  "slug": "til-its-over",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Pop"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 183,
  "audio": "https://cdn.snowstar.company/audio-extra/til-its-over.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/til-its-over.jpg",
  "moods": [
   "Emotional",
   "Uplifting"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 99,
  "vocal": "Vocals",
  "key": "C",
  "scale": "major"
 },
 {
  "title": "TRAIN SESSION",
  "slug": "train-session",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Rock"
  ],
  "packages": [
   "KAYMA — New Trying Outs"
  ],
  "duration": 221,
  "audio": "https://cdn.snowstar.company/audio-extra/train-session.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/train-session.jpg",
  "moods": [
   "Aggressive",
   "Dramatic"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 161,
  "vocal": "Vocals",
  "key": "Bb",
  "scale": "major"
 },
 {
  "title": "DANCING ON DUST",
  "slug": "dancing-on-dust",
  "artist": "KAYMA",
  "genres": [
   "Indie",
   "Pop"
  ],
  "packages": [],
  "duration": 255,
  "audio": "https://cdn.snowstar.company/audio-extra/dancing-on-dust.m4a",
  "cover": "https://cdn.snowstar.company/covers-art-sm/dancing-on-dust.jpg",
  "moods": [
   "Dreamy",
   "Emotional"
  ],
  "instruments": [
   "Vocals",
   "Drums",
   "Synth"
  ],
  "bpm": 78,
  "vocal": "Vocals",
  "key": "A",
  "scale": "major"
 }
 ],
 "packages": [
  "Advertising Essentials",
  "Dance Pop",
  "Electronica",
  "Epic Rock",
  "Hipster",
  "House & Beyond",
  "Orchestral Collection Vol. 01",
  "Orchestral Collection Vol. 02",
  "PEPPER IN-APP SFX",
  "Rock",
  "Selected",
  "Shilton Haztlalim",
  "Vintage"
 ],
 "genres": [
  "Ambient",
  "Chill / Lo-Fi",
  "Cinematic",
  "Classical",
  "Dance",
  "Electronic",
  "Folk & Acoustic",
  "Funk & Soul",
  "Hip Hop",
  "Holiday",
  "House & Techno",
  "Indie",
  "Jazz & Blues",
  "Latin",
  "Metal",
  "Pop",
  "Retro 8-Bit",
  "Rock",
  "SFX",
  "Trap",
  "World"
 ],
 "moods": [
  "Aggressive",
  "Chill",
  "Dark",
  "Dramatic",
  "Epic",
  "Happy",
  "Party",
  "Playful",
  "Romantic",
  "Sad",
  "Tense",
  "Uplifting"
 ]
};
