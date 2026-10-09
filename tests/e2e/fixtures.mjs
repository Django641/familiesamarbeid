// Felles testdata for scripts/e2e.mjs og testfilene. Ingen ekte adresser eller hemmeligheter.

export const OWNER = { email: "voksen1@familie.test", password: "hemmelig-test-1", name: "Kari" };
export const PARTNER = { email: "voksen2@familie.test", password: "hemmelig-test-2", name: "Ola" };
export const CHILDREN = ["Mia", "Noa"];

/** Kun til testserveren. Invitasjonskoder avledes fra denne. */
export const TEST_AUTH_SECRET = "e2e-test-hemmelighet-som-bare-brukes-lokalt-0123456789";
