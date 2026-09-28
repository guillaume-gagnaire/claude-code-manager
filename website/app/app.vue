<script setup lang="ts">
import { FEATURES, SITE } from '~/data/site';

const description =
  'Tous tes Claude Code, dans une seule fenêtre : une app Windows gratuite et open source pour piloter plusieurs agents Claude Code en parallèle.';

useSeoMeta({
  title: 'CCM - Claude Code Manager',
  description,
  ogTitle: 'CCM - Claude Code Manager',
  ogDescription: description,
  ogType: 'website',
  ogUrl: SITE,
  ogImage: `${SITE}images/poster.jpg`,
  twitterCard: 'summary_large_image',
});
</script>

<template>
  <SiteHeader />
  <main>
    <HeroSection />
    <VideoSection />
    <section id="fonctionnalites" class="section">
      <div class="wrap">
        <p class="eyebrow">Fonctionnalités</p>
        <h2>Tout pour travailler avec plusieurs Claude</h2>
        <p class="lead">Chaque agent avance de son côté ; toi, tu gardes la vue d’ensemble et tu interviens quand il le faut.</p>
        <FeatureRow v-for="(f, i) in FEATURES" :key="f.id" :feature="f" :reverse="i % 2 === 1" />
        <FeatureCards />
      </div>
    </section>
    <InstallSteps />
    <FaqSection />
  </main>
  <SiteFooter />
</template>
