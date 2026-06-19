'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CalendarClock,
  Save,
  Monitor,
  Smartphone,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApi, apiPut } from '@/hooks/use-api';

interface ScheduleData {
  id: string;
  enabled: boolean;
  desktopTime: string;
  mobileTime: string;
  edgeTime: string;
  runDesktop: boolean;
  runMobile: boolean;
  runEdge: boolean;
  daysOfWeek: string;
}

const DAYS = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '7', label: 'Sun' },
];

export function ScheduleTab() {
  const { data: schedule, loading, refetch } = useApi<ScheduleData>('/api/schedule');
  const [form, setForm] = useState<Partial<ScheduleData>>({});
  const [saving, setSaving] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set(['1', '2', '3', '4', '5', '6', '7']));

  useEffect(() => {
    if (schedule) {
      setForm(schedule);
      const days = schedule.daysOfWeek.split(',').filter(Boolean);
      setSelectedDays(new Set(days));
    }
  }, [schedule]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      await apiPut('/api/schedule', {
        ...form,
        daysOfWeek: Array.from(selectedDays).join(','),
      });
      toast.success('Schedule saved successfully!');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  }, [form, selectedDays, refetch]);

  const updateForm = (key: keyof ScheduleData, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const toggleDay = (day: string) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  };

  if (loading || !schedule) {
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
      {/* Schedule Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-emerald-600" />
            Schedule Configuration
          </CardTitle>
          <CardDescription>Configure automated search schedules</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Enable Scheduling</Label>
              <p className="text-xs text-muted-foreground">
                Automatically run search sessions on a schedule
              </p>
            </div>
            <Switch
              checked={form.enabled ?? false}
              onCheckedChange={(v) => updateForm('enabled', v)}
            />
          </div>

          {form.enabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              {/* Day Selection */}
              <div className="space-y-3">
                <Label>Active Days</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => (
                    <Button
                      key={day.value}
                      variant={selectedDays.has(day.value) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleDay(day.value)}
                      className={
                        selectedDays.has(day.value)
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white min-w-[52px]'
                          : 'min-w-[52px]'
                      }
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedDays.size === 7
                    ? 'Every day'
                    : selectedDays.size === 5 && !selectedDays.has('6') && !selectedDays.has('7')
                      ? 'Weekdays only'
                      : `${selectedDays.size} days selected`}
                </p>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Desktop Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="h-4 w-4 text-emerald-600" />
            Desktop Search Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Run Desktop Searches</Label>
              <p className="text-xs text-muted-foreground">
                Include desktop search in the scheduled runs
              </p>
            </div>
            <Switch
              checked={form.runDesktop ?? true}
              onCheckedChange={(v) => updateForm('runDesktop', v)}
            />
          </div>
          {form.runDesktop && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <Label htmlFor="desktopTime">Desktop Search Time</Label>
              <Input
                id="desktopTime"
                type="time"
                value={form.desktopTime ?? '09:00'}
                onChange={(e) => updateForm('desktopTime', e.target.value)}
                className="max-w-[200px]"
              />
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Mobile Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-teal-600" />
            Mobile Search Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Run Mobile Searches</Label>
              <p className="text-xs text-muted-foreground">
                Include mobile search in the scheduled runs
              </p>
            </div>
            <Switch
              checked={form.runMobile ?? true}
              onCheckedChange={(v) => updateForm('runMobile', v)}
            />
          </div>
          {form.runMobile && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <Label htmlFor="mobileTime">Mobile Search Time</Label>
              <Input
                id="mobileTime"
                type="time"
                value={form.mobileTime ?? '12:00'}
                onChange={(e) => updateForm('mobileTime', e.target.value)}
                className="max-w-[200px]"
              />
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Edge Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-cyan-600" />
            Edge Search Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Run Edge Searches</Label>
              <p className="text-xs text-muted-foreground">
                Include Edge search in the scheduled runs
              </p>
            </div>
            <Switch
              checked={form.runEdge ?? false}
              onCheckedChange={(v) => updateForm('runEdge', v)}
            />
          </div>
          {form.runEdge && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <Label htmlFor="edgeTime">Edge Search Time</Label>
              <Input
                id="edgeTime"
                type="time"
                value={form.edgeTime ?? '18:00'}
                onChange={(e) => updateForm('edgeTime', e.target.value)}
                className="max-w-[200px]"
              />
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Schedule Preview */}
      {form.enabled && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Schedule Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Days:</span>
                  <span className="font-medium">
                    {selectedDays.size === 7
                      ? 'Every day'
                      : DAYS.filter(d => selectedDays.has(d.value)).map(d => d.label).join(', ')}
                  </span>
                </div>
                {form.runDesktop && (
                  <div className="flex items-center gap-2">
                    <Monitor className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Desktop at {form.desktopTime ?? '09:00'}</span>
                  </div>
                )}
                {form.runMobile && (
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-3.5 w-3.5 text-teal-600" />
                    <span>Mobile at {form.mobileTime ?? '12:00'}</span>
                  </div>
                )}
                {form.runEdge && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-cyan-600" />
                    <span>Edge at {form.edgeTime ?? '18:00'}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Separator />

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
          {saving ? 'Saving...' : 'Save Schedule'}
        </Button>
      </div>
    </motion.div>
  );
}
