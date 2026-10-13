import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EntityType } from "@baselayer-sdk/autocomplete";

import { SegmentIcon, glyphFor, type IconSet } from "../../src/react/icons";

function drawn(
  icons: IconSet | undefined,
  entity: EntityType,
  role: string | null,
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
    expect(glyphFor("address", "registered_office")).toBe("briefcase");
    expect(glyphFor("address", "officer")).toBe("house");
  });

  it("draws a role this build does not know as its entity's own", () => {
    // The roles are an open enum: a value the service sends ahead of this
    // build must not leave a segment without an icon.
    expect(glyphFor("address", "head_office")).toBe("pin");
    expect(glyphFor("person", "director")).toBe("person");
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
    expect(drawn(icons, "address", "registered_office")!.textContent).toBe(
      "any-address",
    );
    expect(drawn(icons, "address", null)!.textContent).toBe("any-address");
    expect(drawn(icons, "person", "agent")!.dataset.glyph).toBe("briefcase");
  });

  it("key an address's office of an agent by the contract's name for it", () => {
    const icons: IconSet = { "address:registered_office": own("agent-office") };

    expect(drawn(icons, "address", "registered_office")!.textContent).toBe(
      "agent-office",
    );
    expect(drawn(icons, "address", "agent")!.dataset.glyph).toBe("pin");
  });

  it("hide the one set to false or null, the entity's or the role's, and every one when off", () => {
    expect(drawn({ "person:agent": false }, "person", "agent")).toBeNull();
    expect(drawn({ "person:agent": null }, "person", "agent")).toBeNull();
    expect(drawn({ address: null }, "address", "mailing")).toBeNull();
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
