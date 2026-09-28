<script setup lang="ts">
import { DOWNLOAD, REPO } from '~/data/site';

const { version } = useRuntimeConfig().public;
</script>

<template>
  <section id="top" class="hero">
    <div class="wrap inner">
      <LogoMark :size="104" class="logo" />
      <h1><span class="ccm">CCM</span> - Claude Code Manager</h1>
      <p class="tag">Tous tes Claude Code, dans une seule fenêtre.</p>
      <p class="pitch">
        Une app Windows pour piloter plusieurs agents Claude Code en parallèle : projets en onglets, chat natif, git, terminaux et
        statistiques, au même endroit.
      </p>
      <div class="cta">
        <a class="btn primary" :href="DOWNLOAD">Télécharger pour Windows</a>
        <a class="btn" :href="REPO">Voir sur GitHub</a>
      </div>
      <p class="meta">Version {{ version }} · Windows 10 et 11 · Gratuit et open source (MIT)</p>
    </div>
  </section>
</template>

<style scoped>
.hero {
  padding: 88px 0 56px;
  text-align: center;
  background: radial-gradient(900px 480px at 50% 0%, color-mix(in oklch, var(--spark) 16%, var(--bg)), var(--bg) 70%);
}
.inner {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.logo {
  margin-bottom: 26px;
}
h1 {
  margin: 0;
  font-size: clamp(38px, 6.4vw, 72px);
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.03em;
}
.ccm {
  color: var(--spark);
}
.tag {
  margin: 18px 0 0;
  font-size: clamp(21px, 2.8vw, 28px);
  font-weight: 700;
}
.pitch {
  max-width: 640px;
  margin: 12px 0 0;
  color: var(--muted);
}
.cta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 32px;
}
.meta {
  margin: 18px 0 0;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--dim);
}
</style>
