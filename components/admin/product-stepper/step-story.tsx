import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type StepStoryProps = {
  form: any;
};

export function StepStory({
  form,
}: StepStoryProps) {
  return (
    <div className="space-y-4">
      <form.Field name="storyTitle">
        {(field: any) => (
          <div className="space-y-2">
            <Label htmlFor="story-title">Story title</Label>
            <Input
              id="story-title"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="A Legacy Weave from Tanjore"
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="storyNarrative">
        {(field: any) => (
          <div className="space-y-2">
            <Label htmlFor="story-narrative">Narrative</Label>
            <Textarea
              className="min-h-36"
              id="story-narrative"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              placeholder="Share provenance, previous owner story, restoration details..."
              value={field.state.value}
            />
          </div>
        )}
      </form.Field>

      <div className="grid gap-4 md:grid-cols-2">
        <form.Field name="storyProvenance">
          {(field: any) => (
            <div className="space-y-2">
              <Label htmlFor="story-provenance">Provenance</Label>
              <Input
                id="story-provenance"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Single-owner collection, Chennai"
                value={field.state.value}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="storyEra">
          {(field: any) => (
            <div className="space-y-2">
              <Label htmlFor="story-era">Era</Label>
              <Input
                id="story-era"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="1990s"
                value={field.state.value}
              />
            </div>
          )}
        </form.Field>
      </div>
    </div>
  );
}
