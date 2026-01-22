import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AssistantPanel from '@/components/AssistantPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, MessageCircle, CalendarCheck, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AssistantPage() {
  const { t } = useTranslation();
  const [showPanel, setShowPanel] = useState(false);

  const features = [
    { icon: CalendarCheck, text: "Gestisci task ed eventi" },
    { icon: Wallet, text: "Traccia le tue spese" },
    { icon: MessageCircle, text: "Chiedi consigli" },
  ];

  return (
    <main className="min-h-screen bg-background">
      <div className="page-container">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="page-header"
        >
          <h1 className="page-title">{t('assistant.title')}</h1>
          <p className="page-subtitle">{t('assistant.subtitle')}</p>
        </motion.div>
        
        <AnimatePresence mode="wait">
          {!showPanel ? (
            <motion.div
              key="intro"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="app-card max-w-2xl mx-auto overflow-hidden">
                <CardContent className="pt-10 sm:pt-12 pb-10 sm:pb-12 text-center px-4 sm:px-6">
                  {/* Avatar LUMI con glow animato */}
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                    className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-6"
                  >
                    <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse" />
                    <div className="relative w-full h-full rounded-full bg-gradient-to-br from-primary via-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25">
                      <Sparkles className="h-10 w-10 sm:h-12 sm:w-12 text-primary-foreground" />
                    </div>
                  </motion.div>
                  
                  <motion.h2 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-2xl sm:text-3xl font-bold mb-3 text-foreground"
                  >
                    Ciao! Sono LUMI ✨
                  </motion.h2>
                  
                  <motion.p 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-sm sm:text-base text-muted-foreground mb-8 max-w-md mx-auto"
                  >
                    Il tuo assistente personale per organizzare la giornata con semplicità e leggerezza
                  </motion.p>
                  
                  {/* Feature chips */}
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex flex-wrap justify-center gap-2 mb-8"
                  >
                    {features.map((feature, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 + idx * 0.1 }}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border"
                      >
                        <feature.icon className="h-4 w-4 text-primary" />
                        <span className="text-xs sm:text-sm text-foreground">{feature.text}</span>
                      </motion.div>
                    ))}
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    <Button 
                      onClick={() => setShowPanel(true)} 
                      size="lg" 
                      className="gap-2 h-12 sm:h-14 px-8 sm:px-10 rounded-xl text-base font-semibold transition-all duration-300 hover:scale-105"
                    >
                      <MessageCircle className="h-5 w-5" />
                      Inizia a chattare
                    </Button>
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="panel"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
            >
              <AssistantPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
