import { Soundfont } from "smplr";
import { classifyMidiTrack, isPianoFamily } from "./classifyTrack.js";

const FALLBACK_INSTRUMENT = "acoustic_grand_piano";

function soundfontName(track) {
  if (track.playback?.isPercussion) return "percussion";
  const name = track.playback?.soundfontName || track.instrument || "";
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || FALLBACK_INSTRUMENT;
}

export class MidiPlayer {
  constructor(song, { onStatus } = {}) {
    this.song = song;
    this.onStatus = onStatus;
    this.context = null;
    this.players = new Map();
    this.position = 0;
    this.startedAt = 0;
    this.playing = false;
  }

  async prepare(trackIds, audioMode = "piano-focus") {
    if (!this.context) this.context = new AudioContext();
    const tracks = this.song.tracks.filter((track) => trackIds.includes(track.id) && track.notes.length);
    this.onStatus?.(`Carregando SoundFont (${tracks.length} instrumentos)...`);
    await Promise.all(tracks.map(async (track) => {
      if (this.players.has(track.id)) return;
      const gain = this.context.createGain();
      gain.connect(this.context.destination);
      const family = track.family || classifyMidiTrack(track.playback);
      const player = Soundfont(this.context, { instrument: soundfontName(track), destination: gain });
      try {
        await player.ready;
      } catch {
        // Um preset ausente não pode silenciar a música inteira.
        const fallback = Soundfont(this.context, { instrument: FALLBACK_INSTRUMENT, destination: gain });
        await fallback.ready;
        this.players.set(track.id, { player: fallback, gain, family });
        return;
      }
      this.players.set(track.id, { player, gain, family });
    }));
    this.setMix(audioMode);
    this.onStatus?.("SoundFont pronto.");
  }

  setMix(mode) {
    this.players.forEach(({ gain, family }) => {
      const isPiano = isPianoFamily(family);
      const value = mode === "piano-only" ? (isPiano ? 1 : 0) : mode === "piano-focus" ? (isPiano ? 1 : 0.55) : 0.85;
      gain.gain.setValueAtTime(value, this.context.currentTime);
    });
  }

  async play(position = this.position) {
    await this.context.resume();
    this.stopVoices();
    this.position = position;
    this.startedAt = this.context.currentTime - position;
    this.players.forEach(({ player }, trackId) => {
      const track = this.song.tracks.find((item) => item.id === trackId);
      track.notes.filter((note) => note.start + note.duration > position).forEach((note) => {
        player.start({
          note: note.pitch,
          velocity: Math.round((note.velocity ?? 0.8) * 127),
          time: this.startedAt + note.start,
          duration: note.duration,
        });
      });
    });
    this.playing = true;
  }

  currentTime() {
    return this.playing ? Math.min(this.song.duration, Math.max(0, this.context.currentTime - this.startedAt)) : this.position;
  }

  pause() {
    this.position = this.currentTime();
    this.stopVoices();
    this.playing = false;
  }

  stop() {
    this.stopVoices();
    this.position = 0;
    this.playing = false;
  }

  stopVoices() { this.players.forEach(({ player }) => player.stop()); }
  dispose() { this.stop(); this.players.forEach(({ player, gain }) => { player.dispose?.(); gain.disconnect(); }); this.players.clear(); this.context?.close(); }
}
