import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AssistantPanel from '@/components/AssistantPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Zap, MessageCircle, CalendarCheck, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AssistantPage() {
  const { t } = useTranslation();
  const [showPanel, setShowPanel] = useState(false);

  const features = [
    { icon: CalendarCheck, text: "Manage tasks & events" },
    { icon: Wallet, text: "Track expenses" },
    { icon: MessageCircle, text: "Get insights" },
  ];

  return (
    <main className="min-h-screen bg-background">
      <div className="page-container">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="page-header"
        >
          <h1 className="page-title">{t('assistant.title')}</h1>
          <p className="page-subtitle">{t('assistant.subtitle')}</p>
        </motion.div>
        
        <AnimatePresence mode="wait">
          {!showPanel ? (
            <motion.div
              key="intro"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="app-card max-w-2xl mx-auto overflow-hidden">
                <CardContent className="pt-10 sm:pt-12 pb-10 sm:pb-12 text-center px-4 sm:px-6">
                  {/* Ayro Avatar */}
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 25 }}
                    className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6"
                  >
                    <div className="absolute inset-0 rounded-xl bg-primary/20 animate-pulse-glow" />
                    <div className="relative w-full h-full rounded-xl bg-primary flex items-center justify-center shadow-ayro">
                      <Zap className="h-8 w-8 sm:h-10 sm:w-10 text-primary-foreground" />
                    </div>
                  </motion.div>
                  
                  <motion.h2 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-xl sm:text-2xl font-semibold mb-2 text-foreground tracking-tight"
                  >
                    Hey! I'm Ayro
                  </motion.h2>
                  
                  <motion.p 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-sm text-muted-foreground mb-8 max-w-md mx-auto"
                  >
                    Your intelligent assistant for productive days. What can I help you with?
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
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 + idx * 0.08 }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted border border-border"
                      >
                        <feature.icon className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs text-foreground">{feature.text}</span>
                      </motion.div>
                    ))}
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55 }}
                  >
                    <Button 
                      onClick={() => setShowPanel(true)} 
                      size="lg" 
                      className="gap-2 h-11 px-6 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-[1.02]"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Start Chat
                    </Button>
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="panel"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              transition={{ duration: 0.25 }}
            >
              <AssistantPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
