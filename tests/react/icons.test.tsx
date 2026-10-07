import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EntityType, RelatedRole } from "@baselayer-sdk/autocomplete";

import { SegmentIcon, glyphFor, type IconSet } from "../../src/react/icons";

function drawn(
  icons: IconSet | undefined,
  entity: EntityType,
  role: RelatedRole | null,
) {
  const { container } = render(
    <SegmentIcon
      icons={icons}
      entity={entity}
      role={role}
      className="bl-ac-icon"
    />,
  );
  return container.querySelector<HTMLElement>(".bl-ac-icon");
}

describe("the glyph a segment draws", () => {
  it("follows the role where it is known, and the entity where it is not", () => {
    expect(glyphFor("business", null)).toBe("building");
    expect(glyphFor("business", "officer")).toBe("building");
    expect(glyphFor("person", null)).toBe("person");
    expect(glyphFor("person", "officer")).toBe("person");
    expect(glyphFor("person", "agent")).toBe("briefcase");
    expect(glyphFor("address", null)).toBe("pin");
    expect(glyphFor("address", "principal")).toBe("pin");
    expect(glyphFor("address", "mailing")).toBe("envelope");
    expect(glyphFor("address", "agent")).toBe("briefcase");
    expect(glyphFor("address", "officer")).toBe("house");
  });

  it("is drawn hidden from screen readers, naming its entity, role and glyph", () => {
    const icon = drawn(undefined, "address", "mailing")!;

    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon.dataset).toMatchObject({
      entity: "address",
      role: "mailing",
      glyph: "envelope",
    });
    expect(icon.querySelector("svg")).not.toBeNull();
    expect(drawn(undefined, "business", null)).not.toHaveAttribute("data-role");
  });
});

describe("a host's icons", () => {
  const own = (id: string) => <b data-testid={id}>{id}</b>;

  it("take the role's key over the entity's, and the entity's over the SDK's", () => {
    const icons: IconSet = {
      address: own("any-address"),
      "address:mailing": own("mailing"),
    };

    const mailing = drawn(icons, "address", "mailing")!;
    expect(mailing.textContent).toBe("mailing");
    expect(mailing).not.toHaveAttribute("data-glyph");
    expect(drawn(icons, "address", "agent")!.textContent).toBe("any-address");
    expect(drawn(icons, "address", null)!.textContent).toBe("any-address");
    expect(drawn(icons, "person", "agent")!.dataset.glyph).toBe("briefcase");
  });

  it("hide the one set to false, the entity's or the role's, and every one when off", () => {
    expect(drawn({ "person:agent": false }, "person", "agent")).toBeNull();
    expect(
      drawn({ "person:agent": false }, "person", "officer"),
    ).not.toBeNull();
    expect(drawn({ person: false }, "person", "officer")).toBeNull();
    // A role's own icon still wins over an entity hidden.
    expect(
      drawn({ person: false, "person:agent": own("agent") }, "person", "agent"),
    ).not.toBeNull();
    expect(drawn(false, "business", null)).toBeNull();
  });
});
