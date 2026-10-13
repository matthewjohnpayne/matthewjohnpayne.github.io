import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// One YAML file per record. Files starting with "_" are templates and are ignored.
const pattern = '[^_]*.yaml';

// Notebooks authored by Matthew Payne. The MPC tutorial site is authoritative;
// this site links to it rather than copying notebook content.
const tutorials = defineCollection({
  loader: glob({ pattern, base: './src/content/tutorials' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    topic: z.enum(['orbits', 'animations']),
    url: z.url(),
    tools: z.array(z.string()).default([]),
    // Site-relative path of an interactive adaptation, once one exists.
    interactive: z.string().optional(),
    order: z.number().default(100)
  })
});

// Public repositories, described in their own words (GitHub description).
const software = defineCollection({
  loader: glob({ pattern, base: './src/content/software' }),
  schema: z.object({
    name: z.string(),
    summary: z.string(),
    repo: z.url(),
    language: z.string().optional(),
    featured: z.boolean().default(false),
    order: z.number().default(100)
  })
});

// Verified bibliographic records only (e.g. from ADS or ORCID), never guessed.
const publications = defineCollection({
  loader: glob({ pattern, base: './src/content/publications' }),
  schema: z.object({
    title: z.string(),
    authors: z.array(z.string()).min(1),
    year: z.number().int(),
    venue: z.string(),
    doi: z.string().optional(),
    bibcode: z.string().optional(),
    url: z.url().optional(),
    featured: z.boolean().default(false),
    source: z.string() // where the record was verified, e.g. "ADS" or "ORCID"
  })
});

// Mentees and collaborators. Each record requires the person's approval.
const people = defineCollection({
  loader: glob({ pattern, base: './src/content/people' }),
  schema: z.object({
    name: z.string(),
    relationship: z.enum(['mentee', 'collaborator']),
    role: z.string().optional(),
    affiliation: z.string().optional(),
    period: z.string().optional(),
    url: z.url().optional(),
    summary: z.string().optional(),
    approvedByPerson: z.literal(true)
  })
});

export const collections = { tutorials, software, publications, people };
