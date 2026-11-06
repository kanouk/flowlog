import * as React from "react";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { DayContent, DayPicker, type DayContentProps } from "react-day-picker";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  datesWithPhotos?: string[];
};

function EntryDayContent(props: DayContentProps) {
  return (
    <>
      <span className="-translate-y-1 leading-none"><DayContent {...props} /></span>
      <span aria-hidden="true" className="calendar-entry-indicator pointer-events-none absolute inset-x-0 bottom-0.5 flex h-2.5 items-center justify-center text-primary">
        {props.activeModifiers.hasPhoto ? (
          <Camera className="h-2.5 w-2.5" />
        ) : props.activeModifiers.hasEntry ? (
          <span className="h-1 w-1 rounded-full bg-current" />
        ) : null}
      </span>
      {props.activeModifiers.hasPhoto && <span className="sr-only">、写真あり</span>}
    </>
  );
}

function Calendar({ className, classNames, showOutsideDays = true, datesWithPhotos, modifiers, modifiersClassNames, components, ...props }: CalendarProps) {
  const photoDates = React.useMemo(() => new Set(datesWithPhotos), [datesWithPhotos]);
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 pointer-events-auto", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(buttonVariants({ variant: "ghost" }), "relative h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
        DayContent: datesWithPhotos !== undefined || modifiers?.hasEntry !== undefined ? EntryDayContent : DayContent,
        ...components,
      }}
      modifiers={{ ...modifiers, hasPhoto: date => photoDates.has(format(date, 'yyyy-MM-dd')) }}
      modifiersClassNames={{ ...modifiersClassNames, hasPhoto: 'has-photo' }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
