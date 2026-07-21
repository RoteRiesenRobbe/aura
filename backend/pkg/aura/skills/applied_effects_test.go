package skills

import "testing"

func TestAppliedEffects_EmptyStoreIsNone(t *testing.T) {
	var b Buffs
	if got := b.AppliedEffects(); got != AppliedEffectNone {
		t.Fatalf("empty store: got %b, want none", got)
	}
}

func TestAppliedEffects_OneBitPerPayloadKind(t *testing.T) {
	tests := []struct {
		name  string
		apply func(b *Buffs)
		want  AppliedEffect
	}{
		{"dot", func(b *Buffs) { b.ApplyDot(1, DotBuff{HP: 2, Interval: 30}, 90) }, AppliedEffectDot},
		{"slow", func(b *Buffs) { b.ApplySlow(1, 0.4, 90) }, AppliedEffectSlow},
		{"hot", func(b *Buffs) { b.ApplyHot(1, HotBuff{HP: 2, Interval: 30}, 90) }, AppliedEffectHot},
		{"resist", func(b *Buffs) { b.ApplyResist(1, []string{"fire"}, 0.5, 90) }, AppliedEffectResist},
		{"tickrate", func(b *Buffs) { b.ApplyTickRate(1, 0.8, 90) }, AppliedEffectTickRate},
		// Shields are deliberately excluded: the shield_hp wire field already
		// carries them, and the overhead bar renders the absorb segment.
		{"shield", func(b *Buffs) { b.ApplyShield(1, 10, 90) }, AppliedEffectNone},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var b Buffs
			tt.apply(&b)
			if got := b.AppliedEffects(); got != tt.want {
				t.Fatalf("got %b, want %b", got, tt.want)
			}
		})
	}
}

func TestAppliedEffects_UnionsAcrossSkillsAndKinds(t *testing.T) {
	var b Buffs
	b.ApplyDot(1, DotBuff{HP: 2, Interval: 30}, 90)
	b.ApplySlow(2, 0.4, 90)
	b.ApplyShield(3, 10, 90)
	want := AppliedEffectDot | AppliedEffectSlow
	if got := b.AppliedEffects(); got != want {
		t.Fatalf("got %b, want %b", got, want)
	}
}

func TestAppliedEffects_ClearsOnExpiry(t *testing.T) {
	var b Buffs
	b.ApplyDot(1, DotBuff{HP: 2, Interval: 30}, 2)
	if b.AppliedEffects() != AppliedEffectDot {
		t.Fatalf("dot not reported while active")
	}
	b.Tick()
	b.Tick()
	if got := b.AppliedEffects(); got != AppliedEffectNone {
		t.Fatalf("after expiry: got %b, want none", got)
	}
}
