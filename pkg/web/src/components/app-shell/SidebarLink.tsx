import type React from "react";

type SidebarLinkProps = React.ComponentProps<"a"> & {
  label: string;
};

export const SidebarLink: React.FC<SidebarLinkProps> = ({ children, label, ...props }) => {
  return <a {...props}>{children ?? label}</a>;
};
