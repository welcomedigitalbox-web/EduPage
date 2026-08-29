export const metadata = {
  title: 'Privacy Policy — Edu Baby House Messenger Assistant',
};

// Public page: the middleware matcher must let this through so Meta can crawl it.
export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-sm leading-7">
      <h1 className="mb-2 text-2xl font-semibold">Privacy Policy</h1>
      <p className="mb-8 text-muted">Last updated: 29 August 2026</p>

      <Section title="Who we are">
        This service is an internal customer-service assistant operated by Edu Baby House
        for its own Facebook Page. It is not offered to third parties.
      </Section>

      <Section title="What we collect">
        When you send a message to our Facebook Page, we receive and store: your
        page-scoped ID (a per-Page identifier issued by Meta, not your Facebook account
        ID), your public name and profile picture, the content of the messages you send
        us, and — if you choose to give them for an order — your phone number and
        delivery address. If you reached us by clicking an advertisement, we also record
        which advertisement it was.
      </Section>

      <Section title="Why we use it">
        To answer your questions, take and deliver your order, follow up if a question is
        left unanswered, and measure which advertisements bring us real customers. We do
        not use your messages to train any AI model.
      </Section>

      <Section title="Who we share it with">
        Messages are processed by Anthropic&apos;s Claude API to generate a reply, and stored
        in our own database hosted on Supabase. Both act as processors on our behalf and
        may not use your data for their own purposes. We do not sell your data or share it
        with advertisers.
      </Section>

      <Section title="How long we keep it">
        Conversations and order records are kept while you remain a customer and for up to
        24 months afterwards, then deleted.
      </Section>

      <Section title="Your choices">
        You can ask us to delete your conversation and contact details at any time by
        sending a message to our Page or writing to the address below. You can also block
        the Page in Messenger, which stops us receiving anything further from you.
      </Section>

      <Section title="Contact">
        Edu Baby House — send a message to our Facebook Page, or email{' '}
        <a className="underline" href="mailto:thukha.edu@gmail.com">thukha.edu@gmail.com</a>.
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-1 font-medium">{title}</h2>
      <p className="text-muted">{children}</p>
    </section>
  );
}
