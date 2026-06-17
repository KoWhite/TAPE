<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import { parseDate } from '@internationalized/date'
import IconCalendar from '~icons/lucide/calendar'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue: string
  label?: string
  min?: string
  max?: string
  class?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)

function parseDateValue(value?: string): DateValue | undefined {
  if (!value) return undefined
  try {
    return parseDate(value)
  } catch {
    return undefined
  }
}

const selectedDate = computed<DateValue | undefined>({
  get: () => parseDateValue(props.modelValue),
  set: (value) => {
    if (!value) return
    emit('update:modelValue', value.toString())
    open.value = false
  },
})

const minDate = computed(() => parseDateValue(props.min))
const maxDate = computed(() => parseDateValue(props.max))
</script>

<template>
  <label :class="cn('block', props.class)">
    <span
      v-if="label"
      class="text-[10px] uppercase tracking-wider text-soft"
    >
      {{ label }}
    </span>
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          type="button"
          variant="outline"
          class="mt-1 h-9 w-full justify-start rounded-lg border-[var(--tape-border)] bg-[var(--tape-input)] px-3 text-left text-sm text-mono font-normal text-[var(--tape-text)] hover:border-[var(--tape-border-hover)] hover:bg-[var(--tape-surface-hover-bg)]"
        >
          <IconCalendar class="size-3.5 text-soft" />
          <span>{{ modelValue }}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        class="w-auto border-[var(--tape-border)] bg-[var(--tape-surface)] p-0"
      >
        <Calendar
          v-model="selectedDate"
          :min-value="minDate"
          :max-value="maxDate"
          initial-focus
        />
      </PopoverContent>
    </Popover>
  </label>
</template>
