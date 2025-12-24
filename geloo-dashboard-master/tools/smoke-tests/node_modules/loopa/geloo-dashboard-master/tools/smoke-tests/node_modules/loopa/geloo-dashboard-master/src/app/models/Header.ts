export interface Header{
    name: string,
    title: string,
    type?: string,
    width?: string,
    default?: string,
    value?: any,
    values?: string[],
    sort?: boolean,
    align?: string,
    link?: string | ((row: any) => string | null);
    maxLength?: number,
    options?: string[],
    reverseBooleanColors?: boolean
}
