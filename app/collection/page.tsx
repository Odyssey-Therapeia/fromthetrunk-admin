import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { ProductCard } from "@/components/product/product-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { sarees } from "@/lib/data/sarees";

export default function CollectionPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-12 px-6 py-16">
      <ScrollReveal className="space-y-4">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
          The Collection
        </p>
        <h1 className="font-serif text-4xl text-foreground md:text-5xl">
          Curated pre-loved sarees
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Discover heirlooms from private wardrobes, couture archives, and
          collector trunks. Each piece is authenticated and accompanied by its
          story.
        </p>
      </ScrollReveal>

      <div className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-soft">
        <div className="grid gap-4 md:grid-cols-4">
          <Input placeholder="Search by designer or motif" />
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Era" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1980s">1980s</SelectItem>
              <SelectItem value="1990s">1990s</SelectItem>
              <SelectItem value="2000s">2000s</SelectItem>
              <SelectItem value="2010s">2010s</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Fabric" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="silk">Silk</SelectItem>
              <SelectItem value="organza">Organza</SelectItem>
              <SelectItem value="tussar">Tussar</SelectItem>
              <SelectItem value="velvet">Velvet</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Occasion" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wedding">Wedding</SelectItem>
              <SelectItem value="festive">Festive</SelectItem>
              <SelectItem value="evening">Evening</SelectItem>
              <SelectItem value="heritage">Heritage</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Separator className="my-6" />
        <p className="text-sm text-muted-foreground">
          Showing {sarees.length} curated pieces. Filtering will be enabled in
          the next release.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sarees.map((saree, index) => (
          <ScrollReveal key={saree.id} delay={index * 0.05}>
            <ProductCard saree={saree} />
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
