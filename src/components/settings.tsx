'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, Settings2, Timer, Search, Play, Type } from 'lucide-react';
import { toast } from 'sonner';
import { useApi, apiPut } from '@/hooks/use-api';

interface SettingsData {
  id: string;
  desktopSearchCount: number;
  mobileSearchCount: number;
  edgeSearchCount: number;
  minDelay: number;
  maxDelay: number;
  cooldownBetweenSearches: number;
  enableRandomDelay: boolean;
  enableAutoStart: boolean;
  autoStartTime: string;
  enableMobileMode: boolean;
  enableEdgeMode: boolean;
  querySource: string;
  customQueries: string;
}

export function SettingsTab() {
  const { data: settings, loading, refetch } = useApi<SettingsData>('/api/settings');
  const [form, setForm] = useState<Partial<SettingsData>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      await apiPut('/api/settings', form);
      toast.success('Settings saved successfully!');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [form, refetch]);

  const updateForm = (key: keyof SettingsData, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-6 w-40 mb-4" />
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Search Counts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-emerald-600" />
            Search Counts
          </CardTitle>
          <CardDescription>Number of searches to perform for each mode</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Desktop Searches</Label>
              <span className="text-sm font-semibold text-emerald-600">{form.desktopSearchCount ?? 30}</span>
            </div>
            <Slider
              value={[form.desktopSearchCount ?? 30]}
              onValueChange={([v]) => updateForm('desktopSearchCount', v)}
              min={1}
              max={50}
              step={1}
              className="[&_[role=slider]]:bg-emerald-600"
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Mobile Searches</Label>
              <span className="text-sm font-semibold text-teal-600">{form.mobileSearchCount ?? 20}</span>
            </div>
            <Slider
              value={[form.mobileSearchCount ?? 20]}
              onValueChange={([v]) => updateForm('mobileSearchCount', v)}
              min={1}
              max={50}
              step={1}
              className="[&_[role=slider]]:bg-teal-600"
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Edge Searches</Label>
              <span className="text-sm font-semibold text-cyan-600">{form.edgeSearchCount ?? 30}</span>
            </div>
            <Slider
              value={[form.edgeSearchCount ?? 30]}
              onValueChange={([v]) => updateForm('edgeSearchCount', v)}
              min={1}
              max={50}
              step={1}
              className="[&_[role=slider]]:bg-cyan-600"
            />
          </div>
        </CardContent>
      </Card>

      {/* Delay Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-4 w-4 text-emerald-600" />
            Delay Settings
          </CardTitle>
          <CardDescription>Configure timing between searches</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Min Delay (seconds)</Label>
              <span className="text-sm font-semibold">{form.minDelay ?? 15}s</span>
            </div>
            <Slider
              value={[form.minDelay ?? 15]}
              onValueChange={([v]) => updateForm('minDelay', v)}
              min={5}
              max={60}
              step={1}
              className="[&_[role=slider]]:bg-emerald-600"
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Max Delay (seconds)</Label>
              <span className="text-sm font-semibold">{form.maxDelay ?? 45}s</span>
            </div>
            <Slider
              value={[form.maxDelay ?? 45]}
              onValueChange={([v]) => updateForm('maxDelay', v)}
              min={10}
              max={120}
              step={1}
              className="[&_[role=slider]]:bg-emerald-600"
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Cooldown Between Searches (seconds)</Label>
              <span className="text-sm font-semibold">{form.cooldownBetweenSearches ?? 5}s</span>
            </div>
            <Slider
              value={[form.cooldownBetweenSearches ?? 5]}
              onValueChange={([v]) => updateForm('cooldownBetweenSearches', v)}
              min={1}
              max={30}
              step={1}
              className="[&_[role=slider]]:bg-emerald-600"
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Random Delay</Label>
              <p className="text-xs text-muted-foreground">
                Randomize delay between min and max for each search
              </p>
            </div>
            <Switch
              checked={form.enableRandomDelay ?? true}
              onCheckedChange={(v) => updateForm('enableRandomDelay', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-emerald-600" />
            Options
          </CardTitle>
          <CardDescription>Enable or disable search modes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Mobile Mode</Label>
              <p className="text-xs text-muted-foreground">
                Allow mobile search sessions to be created
              </p>
            </div>
            <Switch
              checked={form.enableMobileMode ?? true}
              onCheckedChange={(v) => updateForm('enableMobileMode', v)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Edge Mode</Label>
              <p className="text-xs text-muted-foreground">
                Allow Edge search sessions to be created
              </p>
            </div>
            <Switch
              checked={form.enableEdgeMode ?? false}
              onCheckedChange={(v) => updateForm('enableEdgeMode', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Auto Start */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="h-4 w-4 text-emerald-600" />
            Auto Start
          </CardTitle>
          <CardDescription>Automatically start search sessions at a scheduled time</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Auto Start</Label>
              <p className="text-xs text-muted-foreground">
                Start sessions automatically at the specified time
              </p>
            </div>
            <Switch
              checked={form.enableAutoStart ?? false}
              onCheckedChange={(v) => updateForm('enableAutoStart', v)}
            />
          </div>
          {form.enableAutoStart && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <Label htmlFor="autoStartTime">Auto Start Time</Label>
              <Input
                id="autoStartTime"
                type="time"
                value={form.autoStartTime ?? '09:00'}
                onChange={(e) => updateForm('autoStartTime', e.target.value)}
                className="max-w-[200px]"
              />
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Query Source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Type className="h-4 w-4 text-emerald-600" />
            Query Source
          </CardTitle>
          <CardDescription>Choose how search queries are generated</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={form.querySource ?? 'trending'}
            onValueChange={(v) => updateForm('querySource', v)}
            className="space-y-3"
          >
            <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="trending" id="trending" className="mt-0.5" />
              <div className="space-y-1">
                <Label htmlFor="trending" className="font-medium">Trending Topics</Label>
                <p className="text-xs text-muted-foreground">
                  Generate queries based on trending topics and popular searches
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="random" id="random" className="mt-0.5" />
              <div className="space-y-1">
                <Label htmlFor="random" className="font-medium">Random Queries</Label>
                <p className="text-xs text-muted-foreground">
                  Use built-in random topic categories for variety
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="custom" id="custom" className="mt-0.5" />
              <div className="space-y-1">
                <Label htmlFor="custom" className="font-medium">Custom Queries</Label>
                <p className="text-xs text-muted-foreground">
                  Provide your own comma-separated list of search queries
                </p>
              </div>
            </div>
          </RadioGroup>

          {form.querySource === 'custom' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <Label htmlFor="customQueries">Custom Queries</Label>
              <Textarea
                id="customQueries"
                placeholder="Enter comma-separated queries, e.g., best laptops 2026, healthy recipes, travel tips"
                value={form.customQueries ?? ''}
                onChange={(e) => updateForm('customQueries', e.target.value)}
                rows={4}
              />
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          size="lg"
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px]"
        >
          {saving ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Save className="h-4 w-4" />
            </motion.div>
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </motion.div>
  );
}
