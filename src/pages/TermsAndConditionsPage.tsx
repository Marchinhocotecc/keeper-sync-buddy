import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ScrollText } from 'lucide-react';

export default function TermsAndConditionsPage() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna indietro
        </Button>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="border-b border-border/50">
            <div className="flex items-center gap-3">
              <ScrollText className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl">Termini e Condizioni</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6 max-h-[60vh] overflow-y-auto">
            <section>
              <h2 className="text-lg font-semibold mb-3">1. Accettazione dei Termini</h2>
              <p className="text-muted-foreground leading-relaxed">
                Utilizzando questa applicazione, l'utente accetta di essere vincolato dai presenti 
                Termini e Condizioni. Se non si accettano questi termini, si prega di non utilizzare 
                l'applicazione.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">2. Descrizione del Servizio</h2>
              <p className="text-muted-foreground leading-relaxed">
                Daily Sync Keeper è un'applicazione per la gestione personale che include funzionalità 
                di tracciamento delle attività, gestione delle spese, calendario e assistente virtuale. 
                Il servizio è fornito "così com'è" senza garanzie di alcun tipo.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">3. Account Utente</h2>
              <p className="text-muted-foreground leading-relaxed">
                L'utente è responsabile del mantenimento della riservatezza delle proprie credenziali 
                di accesso e di tutte le attività svolte con il proprio account. L'utente si impegna 
                a notificare immediatamente qualsiasi uso non autorizzato del proprio account.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">4. Privacy e Dati</h2>
              <p className="text-muted-foreground leading-relaxed">
                I dati personali dell'utente sono trattati in conformità con la nostra Informativa 
                sulla Privacy. Utilizziamo i dati raccolti per fornire e migliorare il servizio. 
                L'utente mantiene la proprietà dei propri dati e può richiederne la cancellazione 
                in qualsiasi momento.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">5. Uso Accettabile</h2>
              <p className="text-muted-foreground leading-relaxed">
                L'utente si impegna a non utilizzare l'applicazione per scopi illegali o non 
                autorizzati. È vietato tentare di accedere a dati di altri utenti, interferire 
                con il funzionamento del servizio o caricare contenuti dannosi.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">6. Modifiche ai Termini</h2>
              <p className="text-muted-foreground leading-relaxed">
                Ci riserviamo il diritto di modificare questi termini in qualsiasi momento. 
                Le modifiche entreranno in vigore immediatamente dopo la pubblicazione. 
                L'uso continuato dell'applicazione dopo tali modifiche costituisce accettazione 
                dei nuovi termini.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">7. Limitazione di Responsabilità</h2>
              <p className="text-muted-foreground leading-relaxed">
                In nessun caso saremo responsabili per danni indiretti, incidentali, speciali, 
                consequenziali o punitivi derivanti dall'uso o dall'impossibilità di utilizzare 
                il servizio.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">8. Contatti</h2>
              <p className="text-muted-foreground leading-relaxed">
                Per domande riguardanti questi Termini e Condizioni, contattaci all'indirizzo 
                email: support@dailysynckeeper.app
              </p>
            </section>

            <p className="text-sm text-muted-foreground pt-4 border-t border-border/50">
              Ultimo aggiornamento: Dicembre 2024
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
